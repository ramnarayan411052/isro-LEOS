"""Google OR-Tools CP-SAT flexible job-shop scheduler."""
from dataclasses import dataclass, field
from decimal import Decimal
from time import perf_counter
from collections import defaultdict
import math
import pandas as pd
from ortools.sat.python import cp_model
from .data_loader import load_table
from .data_validator import validate_inputs
from .schema_mapper import SchemaMapping
from .metrics import calculate_metrics
from .schedule_validator import validate_schedule

@dataclass
class SchedulerResult:
    schedule: pd.DataFrame
    metrics: dict
    status: str
    timings: dict
    objective_value: float | None = None
    best_bound: float | None = None
    model_stats: str = ""
    validation_errors: list = field(default_factory=list)

    @property
    def feasible(self): return self.status in {"OPTIMAL", "FEASIBLE"}

def _integer_weights(weights):
    vals={k:Decimal(str(v)) for k,v in weights.items()}
    if any(v<0 for v in vals.values()) or not any(vals.values()): raise ValueError("objective weights must be nonnegative and not all zero")
    places=max(max(0,-v.as_tuple().exponent) for v in vals.values())
    scale=10**places
    ints={k:int(v*scale) for k,v in vals.items()}
    divisor=math.gcd(*[x for x in ints.values() if x])
    return {k:v//divisor for k,v in ints.items()}

def solve_schedule(tasks, eligibility, *, time_limit_seconds=60, num_workers=8, random_seed=42,
                   objective="weighted", objective_weights=None, log_search_progress=False,
                   schema_mapping=None):
    """Solve a flexible manufacturing schedule.

    Each task selects exactly one eligible operator/resource alternative.
    Optional intervals share the task's start/end and are present only for the
    selected alternative. NoOverlap independently protects operators/resources.
    """
    if float(time_limit_seconds) <= 0: raise ValueError("time_limit_seconds must be positive")
    if int(random_seed) < 0: raise ValueError("random_seed must be nonnegative")
    t0=perf_counter()
    raw_t=load_table(tasks); raw_e=load_table(eligibility)
    load_s=perf_counter()-t0
    mapper=schema_mapping or SchemaMapping()
    raw_t,raw_e=mapper.rename(raw_t,raw_e)
    validation_t=perf_counter(); tasks,eligibility=validate_inputs(raw_t,raw_e)
    validation_s=perf_counter()-validation_t
    if objective not in {"weighted","makespan","total_tardiness"}:
        raise ValueError("objective must be weighted, makespan, or total_tardiness")
    weights=objective_weights or {"makespan":1,"total_tardiness":1}
    int_weights=_integer_weights(weights)
    build_t=perf_counter()
    model=cp_model.CpModel()
    tids=list(tasks.task_id)
    bytask={k:g.to_dict("records") for k,g in eligibility.groupby("task_id",sort=False)}
    horizon=max(int(tasks.arrival.max()),0)+sum(max(a["process_time"] for a in bytask[tid]) for tid in tids)
    horizon=max(horizon, max(int(tasks.due.max()),0))
    starts={}; ends={}; tardies={}; picks_by_task=defaultdict(list); ops=defaultdict(list); resources=defaultdict(list)
    t_index=tasks.set_index("task_id")
    for i,tid in enumerate(tids):
        task=t_index.loc[tid]
        start=model.NewIntVar(int(task.arrival),horizon,f"start_{i}")
        end=model.NewIntVar(int(task.arrival),horizon,f"end_{i}")
        starts[tid],ends[tid]=start,end
        literals=[]
        for j,a in enumerate(bytask[tid]):
            lit=model.NewBoolVar(f"assign_{i}_{j}"); literals.append(lit)
            interval=model.NewOptionalIntervalVar(start,int(a["process_time"]),end,lit,f"interval_{i}_{j}")
            ops[a["operator"]].append(interval); resources[a["resource"]].append(interval)
            picks_by_task[tid].append((lit,a))
        model.AddExactlyOne(literals)
        tardy=model.NewIntVar(0,horizon,f"tardiness_{i}")
        model.AddMaxEquality(tardy,[end-int(task.due),0]); tardies[tid]=tardy
    for intervals in ops.values(): model.AddNoOverlap(intervals)
    for intervals in resources.values(): model.AddNoOverlap(intervals)
    makespan=model.NewIntVar(0,horizon,"makespan")
    model.AddMaxEquality(makespan,list(ends.values()))
    total_tardiness=model.NewIntVar(0,horizon*len(tids),"total_tardiness")
    model.Add(total_tardiness==sum(tardies.values()))
    if objective=="makespan": model.Minimize(makespan)
    elif objective=="total_tardiness": model.Minimize(total_tardiness)
    else:
        w=_integer_weights(weights)
        model.Minimize(w.get("makespan",0)*makespan+w.get("total_tardiness",0)*total_tardiness)
    model_s=perf_counter()-build_t
    invalid=model.Validate()
    model_stats=model.ModelStats()
    if invalid:
        timings={"loading_seconds":load_s,"validation_seconds":validation_s,"model_building_seconds":model_s,"solving_seconds":0.0}
        return SchedulerResult(pd.DataFrame(),{},"MODEL_INVALID",timings,model_stats=model_stats,validation_errors=[invalid])
    solver=cp_model.CpSolver()
    solver.parameters.max_time_in_seconds=max(0.001,float(time_limit_seconds))
    solver.parameters.num_search_workers=max(1,int(num_workers))
    solver.parameters.random_seed=int(random_seed)
    solver.parameters.log_search_progress=bool(log_search_progress)
    solve_t=perf_counter(); status_code=solver.Solve(model); solve_s=perf_counter()-solve_t
    status=solver.StatusName(status_code)
    timings={"loading_seconds":load_s,"validation_seconds":validation_s,"model_building_seconds":model_s,"solving_seconds":solve_s}
    if status not in {"OPTIMAL","FEASIBLE"}:
        return SchedulerResult(pd.DataFrame(),{"solver_status":status,"objective_value":None,
                               "timeout_reached":status=="UNKNOWN" and solve_s >= float(time_limit_seconds)*0.9},status,timings,
                               model_stats=model_stats)
    rows=[]
    for tid in tids:
        chosen=next(a for lit,a in picks_by_task[tid] if solver.BooleanValue(lit))
        start,end=solver.Value(starts[tid]),solver.Value(ends[tid]); due=int(t_index.loc[tid].due)
        tardy=max(0,end-due)
        rows.append({"task_id":tid,"start":start,"end":end,"duration":chosen["process_time"],
                     "operator":chosen["operator"],"resource":chosen["resource"],"due":due,
                     "tardiness":tardy,"status":"late" if tardy else "on_time"})
    schedule=pd.DataFrame(rows)
    errors=validate_schedule(schedule,tasks,eligibility)
    obj=solver.ObjectiveValue()
    metrics=calculate_metrics(schedule,status,obj)
    metrics["best_bound"]=solver.BestObjectiveBound()
    metrics["optimality_proven"]=status=="OPTIMAL"
    metrics["timeout_reached"]=status=="UNKNOWN" and solve_s >= float(time_limit_seconds)*0.9
    return SchedulerResult(schedule,metrics,status,timings,obj,solver.BestObjectiveBound(),model_stats,errors)










