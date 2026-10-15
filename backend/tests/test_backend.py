import unittest
from pathlib import Path
from unittest.mock import patch
import time
import pandas as pd
from ortools.sat.python import cp_model
from src.data_validator import validate_inputs, DataValidationError
from src.cp_sat_scheduler import solve_schedule
from src.baseline_schedulers import schedule_baseline


def inputs():
    tasks = pd.DataFrame([
        {"task_id":"a", "duration":3, "arrival":0, "due":4, "priority":1, "original_operator":"o1", "original_resource":"r1"},
        {"task_id":"b", "duration":2, "arrival":0, "due":2, "priority":2, "original_operator":"o2", "original_resource":"r2"},
    ])
    elig = pd.DataFrame([
        {"task_id":"a", "operator":"o1", "resource":"r1", "process_time":3},
        {"task_id":"a", "operator":"o2", "resource":"r2", "process_time":3},
        {"task_id":"b", "operator":"o1", "resource":"r1", "process_time":2},
        {"task_id":"b", "operator":"o2", "resource":"r2", "process_time":2},
    ])
    return tasks, elig

class TestValidation(unittest.TestCase):
    def test_duplicate_and_missing_alternative_rejected(self):
        t,e=inputs(); t=pd.concat([t,t.iloc[[0]]],ignore_index=True)
        with self.assertRaises(DataValidationError): validate_inputs(t,e)
        t,e=inputs(); e=e[e.task_id!="b"]
        with self.assertRaises(DataValidationError): validate_inputs(t,e)
    def test_all_baselines_are_valid_and_original_pair_is_used(self):
        from src.schedule_validator import validate_schedule
        t,e=inputs(); t,e=validate_inputs(t,e)
        for rule in ("edd","spt","priority","original"):
            schedule=schedule_baseline(t,e,rule)
            self.assertEqual(validate_schedule(schedule,t,e),[])
        original=schedule_baseline(t,e,"original").set_index("task_id")
        for row in t.itertuples(index=False):
            self.assertEqual(original.loc[row.task_id,"operator"],row.original_operator)
            self.assertEqual(original.loc[row.task_id,"resource"],row.original_resource)

    def test_independent_schedule_validator(self):
        from src.schedule_validator import validate_schedule
        t,e=inputs(); t,e=validate_inputs(t,e); s=schedule_baseline(t,e,"edd")
        self.assertEqual(validate_schedule(s,t,e),[])
        s.loc[0,"start"]=-1
        self.assertTrue(validate_schedule(s,t,e))

class TestScheduler(unittest.TestCase):
    def test_unknown_timeout_status_is_reported(self):
        t=pd.DataFrame([{"task_id":"x","duration":2,"arrival":0,"due":10}])
        e=pd.DataFrame([{"task_id":"x","operator":"o","resource":"r","process_time":2}])
        def timeout(*args,**kwargs):
            time.sleep(0.02)
            return cp_model.UNKNOWN
        with patch.object(cp_model.CpSolver,"Solve",side_effect=timeout):
            result=solve_schedule(t,e,time_limit_seconds=0.001,num_workers=1)
        self.assertEqual(result.status,"UNKNOWN")
        self.assertTrue(result.metrics["timeout_reached"])
        self.assertTrue(result.model_stats)
    def test_single_task_arrival_and_tardiness(self):
        t=pd.DataFrame([{"task_id":"x","duration":5,"arrival":7,"due":10}])
        e=pd.DataFrame([{"task_id":"x","operator":"o","resource":"r","process_time":5}])
        result=solve_schedule(t,e,time_limit_seconds=2,num_workers=1)
        self.assertEqual(result.status,"OPTIMAL"); row=result.schedule.iloc[0]
        self.assertEqual((row.start,row.end,row.tardiness),(7,12,2))
    def test_shared_operator_and_resource_conflicts(self):
        for operator, resources in [("o", ["r1","r2"]), (None,["r","r"])]:
            t=pd.DataFrame([{"task_id":"a","duration":2,"arrival":0,"due":20},{"task_id":"b","duration":2,"arrival":0,"due":20}])
            e=pd.DataFrame([
                {"task_id":"a","operator":operator or "o1","resource":resources[0],"process_time":2},
                {"task_id":"b","operator":operator or "o2","resource":resources[1],"process_time":2}])
            result=solve_schedule(t,e,time_limit_seconds=2,num_workers=1)
            self.assertEqual(result.status,"OPTIMAL"); self.assertEqual(result.metrics["makespan"],4)
    def test_parallel_separate_resources(self):
        t=pd.DataFrame([{"task_id":"a","duration":2,"arrival":0,"due":9},{"task_id":"b","duration":2,"arrival":0,"due":9}])
        e=pd.DataFrame([{"task_id":"a","operator":"a","resource":"ra","process_time":2},{"task_id":"b","operator":"b","resource":"rb","process_time":2}])
        result=solve_schedule(t,e,time_limit_seconds=2,num_workers=1)
        self.assertEqual(result.status,"OPTIMAL"); self.assertEqual(result.metrics["makespan"],2)
    def test_ineligible_assignment_not_used(self):
        t=pd.DataFrame([{"task_id":"x","duration":2,"arrival":0,"due":20}])
        e=pd.DataFrame([{"task_id":"x","operator":"allowed","resource":"r","process_time":3}])
        result=solve_schedule(t,e,time_limit_seconds=2,num_workers=1)
        self.assertEqual(result.schedule.iloc[0].operator,"allowed")
    def test_baseline_and_csv_export(self):
        from src.export_results import export_schedule
        t,e=inputs(); t,e=validate_inputs(t,e); schedule=schedule_baseline(t,e,"edd")
        path=Path(__file__).parent/"_schedule_export_test.csv"
        try:
            export_schedule(schedule,path)
            self.assertEqual(len(pd.read_csv(path)),2)
        finally:
            path.unlink(missing_ok=True)

