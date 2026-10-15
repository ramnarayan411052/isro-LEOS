# DynamIQ scheduling backend

Standalone manufacturing scheduling backend using Google OR-Tools CP-SAT. It has no Streamlit dependency and reads CSV or Excel inputs.

## Install and run

From this directory, install `requirements.txt`, then run:

```powershell
python run_scheduler.py --time-limit 60 --workers 8 --objective weighted --output results/schedule.csv
```

Pass `--tasks` and `--eligibility` to select alternate CSV/XLSX files. `--baselines` also calculates EDD, SPT, priority, and original-pair metrics. Use `--log-search-progress` for CP-SAT logs. Output includes solver status, objective, best bound, loading/validation/model/solve timings, and model statistics. Only OPTIMAL means optimality was proved; FEASIBLE is a valid incumbent without proof. UNKNOWN is a timeout/no-solution status, distinct from INFEASIBLE.

Python interface:

```python
from src.cp_sat_scheduler import solve_schedule
result = solve_schedule(tasks_df, eligibility_df, time_limit_seconds=60)
```

`SchemaMapping` maps internal field names to input column names. Required task fields are task ID, task duration, arrival and due times; required eligibility fields are task ID, operator, resource and alternative process time. The selected alternative's process time determines the actual scheduled duration. Times and durations must be nonnegative whole minutes; alternative process times must be positive. Invalid/duplicate IDs, unknown tasks, tasks without alternatives, duplicate pairs, and invalid original pairs are reported rather than silently removed.

## Model

Each task has integer start and end variables, with start bounded below by arrival. Exactly one eligibility Boolean is selected. Every possible alternative is represented by an optional interval sharing the task's start and end, with that alternative's process time; only the selected interval is present. `AddNoOverlap` is applied separately per operator and per resource, so unselected alternatives do not reserve capacity. Tardiness is `max(0, end - due)`, and makespan is the maximum task end. No precedence, calendar, downtime, or extra capacity assumptions are added.

The default weighted objective is `makespan + total tardiness`. Decimal weights are converted to exact integer coefficients (and common factors removed), so nonzero weights do not round away. Select `makespan` or `total_tardiness` to optimize one metric. All metrics are reported regardless of objective.

## Baselines and limits

EDD, SPT and priority baselines dispatch tasks in the corresponding sorted order and assign each task its shortest eligible process-time alternative. Original assignment uses the original eligible operator/resource pair when present. They are deterministic list schedules: each task is placed at the earliest start allowed by its arrival and the selected operator/resource availability, so tasks on distinct operators/resources can overlap. CP-SAT jointly chooses assignments and start times; these baseline results are not hardcoded.

The priority baseline orders numeric values ascending, then uses due date and arrival as tie breakers. Current data contains priorities 1–5, though the original request defined 1–3; 4 and 5 therefore follow 1–3 by their numeric ordering and this assumption should be revisited if those values have a different business meaning.

## Validation and tests

Every feasible CP-SAT schedule is checked independently for task coverage, eligibility, durations, arrival times, due/tardiness calculations, and operator/resource conflicts. Run tests with:

```powershell
python -m unittest discover -s tests -v
```

The full dataset contains 4,000 tasks and 100,000 alternatives. This implementation retains all alternatives as optional intervals. Benchmark model construction and solving before relying on this model under production latency limits.

