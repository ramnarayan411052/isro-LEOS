"""Schedule metrics."""
def calculate_metrics(schedule, solver_status=None, objective_value=None):
    if schedule.empty:
        return {"makespan":0,"total_tardiness":0,"late_task_count":0,"mean_tardiness":0.0,
                "operator_utilization":{},"resource_utilization":{},"solver_status":solver_status,"objective_value":objective_value}
    horizon=max(1,int(schedule.end.max()))
    def utilization(col): return {str(k):float(g.duration.sum()/horizon) for k,g in schedule.groupby(col)}
    return {"makespan":int(schedule.end.max()),"total_tardiness":int(schedule.tardiness.sum()),
            "late_task_count":int((schedule.tardiness>0).sum()),"mean_tardiness":float(schedule.tardiness.mean()),
            "operator_utilization":utilization("operator"),"resource_utilization":utilization("resource"),
            "solver_status":solver_status,"objective_value":objective_value}
