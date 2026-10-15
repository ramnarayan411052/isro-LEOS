"""Serial dispatching baselines with compatible eligibility and capacities."""
import pandas as pd

def schedule_baseline(tasks, eligibility, rule="edd"):
    """Schedule one task at a time globally; choose shortest eligible alternative.

    Original uses the task's original pair when available. Priority ranks numeric
    values ascending (so priority 1 precedes 2, 3, 4, 5 in this dataset).
    """
    rule=rule.lower()
    if rule not in {"edd","spt","priority","original"}: raise ValueError("rule must be edd, spt, priority, or original")
    by_task={k:g.to_dict("records") for k,g in eligibility.groupby("task_id")}
    records=tasks.to_dict("records")
    if rule=="edd": records.sort(key=lambda t:(t["due"],t["arrival"],t["task_id"]))
    elif rule=="spt": records.sort(key=lambda t:(min(a["process_time"] for a in by_task[t["task_id"]]),t["arrival"],t["task_id"]))
    elif rule=="priority": records.sort(key=lambda t:(int(t.get("priority",99)),t["due"],t["arrival"],t["task_id"]))
    else: records.sort(key=lambda t:(t["arrival"],t["due"],t["task_id"]))
    op_free,res_free,output={},{},[]
    for t in records:
        choices=by_task[t["task_id"]]
        if rule=="original" and t.get("original_operator") and t.get("original_resource"):
            orig=[a for a in choices if a["operator"]==str(t["original_operator"]) and a["resource"]==str(t["original_resource"])]
            if orig: choices=orig
        a=min(choices,key=lambda x:(x["process_time"],x["operator"],x["resource"]))
        start=max(int(t["arrival"]),op_free.get(a["operator"],0),res_free.get(a["resource"],0))
        end=start+int(a["process_time"]); op_free[a["operator"]]=end; res_free[a["resource"]]=end
        tardy=max(0,end-int(t["due"]))
        output.append({"task_id":t["task_id"],"start":start,"end":end,"duration":int(a["process_time"]),
          "operator":a["operator"],"resource":a["resource"],"due":int(t["due"]),"tardiness":tardy,
          "status":"late" if tardy else "on_time"})
    return pd.DataFrame(output)
