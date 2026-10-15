"""Independent schedule feasibility checker."""
def validate_schedule(schedule, tasks, eligibility):
    errors=[]
    required={"task_id","start","end","duration","operator","resource","due","tardiness"}
    missing=required-set(schedule.columns)
    if missing: return [f"schedule missing columns: {sorted(missing)}"]
    if schedule.task_id.duplicated().any(): errors.append("schedule has duplicate tasks")
    if set(schedule.task_id)!=set(tasks.task_id): errors.append("schedule task set differs from input tasks")
    task_data=tasks.set_index("task_id")
    allowed=set(zip(eligibility.task_id,eligibility.operator,eligibility.resource,eligibility.process_time))
    for row in schedule.itertuples(index=False):
        if row.task_id not in task_data.index: continue
        t=task_data.loc[row.task_id]
        if row.start<t.arrival: errors.append(f"{row.task_id} starts before arrival")
        if row.end!=row.start+row.duration: errors.append(f"{row.task_id} end/duration mismatch")
        if row.due!=t.due: errors.append(f"{row.task_id} due date mismatch")
        if row.tardiness!=max(0,row.end-row.due): errors.append(f"{row.task_id} tardiness mismatch")
        if (row.task_id,row.operator,row.resource,row.duration) not in allowed: errors.append(f"{row.task_id} is ineligible or has incorrect duration")
    for col in ("operator","resource"):
        for key,group in schedule.sort_values("start").groupby(col):
            rows=list(group.itertuples(index=False))
            for a,b in zip(rows,rows[1:]):
                if b.start<a.end: errors.append(f"{col} {key} overlaps tasks {a.task_id}/{b.task_id}")
    return errors
