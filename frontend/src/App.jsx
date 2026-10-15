import { useMemo, useState } from "react";

const PAGES = ["Overview", "Task Scheduling", "Task Management", "Workforce"];
const PRIORITY_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const SKILLS = ["CNC machining", "Assembly", "Quality control", "Finishing", "Packaging"];
const STARTER_JOBS = [
  { "Job ID": "JOB-1042", Task: "Precision Milling", Machine: "CNC-01", Priority: "High", "Duration (min)": 42, Due: todayAt("10:45"), Status: "Running", Progress: 68, Workforce: "Unassigned" },
  { "Job ID": "JOB-1043", Task: "Component Inspection", Machine: "QC-02", Priority: "Critical", "Duration (min)": 18, Due: todayAt("11:00"), Status: "Queued", Progress: 0, Workforce: "Unassigned" },
  { "Job ID": "JOB-1044", Task: "Assembly Batch A", Machine: "ASM-01", Priority: "Medium", "Duration (min)": 55, Due: todayAt("11:30"), Status: "Queued", Progress: 0, Workforce: "Unassigned" },
  { "Job ID": "JOB-1045", Task: "Surface Finishing", Machine: "FIN-03", Priority: "High", "Duration (min)": 35, Due: todayAt("11:15"), Status: "Running", Progress: 34, Workforce: "Unassigned" },
  { "Job ID": "JOB-1047", Task: "Lathe Operation", Machine: "CNC-02", Priority: "Medium", "Duration (min)": 48, Due: todayAt("12:00"), Status: "Queued", Progress: 0, Workforce: "Unassigned" },
];
const STARTER_OPERATORS = [
  { "Operator ID": "OP-1001", Operator: "A. Sharma", "Skill group": "CNC machining", Shift: "Shift 1", Availability: "Available", "Assigned jobs": 2, Utilization: 74 },
  { "Operator ID": "OP-1002", Operator: "M. Patel", "Skill group": "Assembly", Shift: "Shift 1", Availability: "On task", "Assigned jobs": 3, Utilization: 88 },
  { "Operator ID": "OP-1003", Operator: "S. Kumar", "Skill group": "Quality control", Shift: "Shift 1", Availability: "Available", "Assigned jobs": 1, Utilization: 52 },
  { "Operator ID": "OP-1004", Operator: "R. Singh", "Skill group": "Finishing", Shift: "Shift 1", Availability: "Break", "Assigned jobs": 1, Utilization: 66 },
  { "Operator ID": "OP-1005", Operator: "P. Das", "Skill group": "Packaging", Shift: "Shift 1", Availability: "Available", "Assigned jobs": 2, Utilization: 61 },
];

function todayAt(time) {
  const date = new Date();
  const [hours, minutes] = time.split(":");
  date.setHours(Number(hours), Number(minutes), 0, 0);
  return formatDateTime(date);
}

function formatDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function useStoredState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  });
  const update = (next) => {
    setValue((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      try { localStorage.setItem(key, JSON.stringify(resolved)); } catch { /* storage can be unavailable */ }
      return resolved;
    });
  };
  return [value, update];
}

function downloadCsv(rows, filename) {
  if (!rows.length) return;
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [columns.map(escape).join(","), ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Metric({ label, value, foot, icon }) {
  return <article className="metric-card"><div className="metric-label"><span>{icon}</span>{label}</div><div className="metric-value">{value}</div><div className="metric-foot">{foot}</div></article>;
}

function DataTable({ columns, rows, children }) {
  return <div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{children ?? rows.map((row, index) => <tr key={`${row[columns[0]]}-${index}`}>{columns.map((column) => <td key={column}>{row[column]}</td>)}</tr>)}</tbody></table></div>;
}

export default function App() {
  const [page, setPage] = useState("Overview");
  const [jobs, setJobs] = useStoredState("dynamiq.jobs", STARTER_JOBS);
  const [operators, setOperators] = useStoredState("dynamiq.operators", STARTER_OPERATORS);
  const [schedule, setSchedule] = useStoredState("dynamiq.schedule", null);
  const [archived, setArchived] = useStoredState("dynamiq.archived", []);
  const [runs, setRuns] = useStoredState("dynamiq.runs", 12);
  const [lastSchedule, setLastSchedule] = useStoredState("dynamiq.lastSchedule", new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  const [notice, setNotice] = useState("");
  const [objective, setObjective] = useState("Balanced throughput");
  const [horizon, setHorizon] = useState("Next 2 hours");
  const [strategy, setStrategy] = useState("DQN policy (demo)");
  const [constraints, setConstraints] = useState({ compatibility: true, critical: true, overload: true });
  const [taskForm, setTaskForm] = useState({ id: "", task: "", machine: "", priority: "Low", duration: "30", unit: "Minutes", dueDate: new Date().toISOString().slice(0, 10), dueTime: "13:00" });
  const [operatorForm, setOperatorForm] = useState({ id: "", name: "", skill: SKILLS[0], shift: "Shift 1", availability: "Available" });
  const [selectedJob, setSelectedJob] = useState("");

  const activeJobs = jobs.filter((job) => job.Status !== "Completed");
  const running = jobs.filter((job) => job.Status === "Running").length;
  const queued = jobs.filter((job) => job.Status === "Queued").length;
  const completionColumns = ["Sequence", "Job ID", "Task", "Machine", "Workforce", "Priority", "Duration (min)", "Due", "Recommended start"];
  const availableOperators = operators.filter((operator) => operator.Availability === "Available");
  const noticeMessage = useMemo(() => notice, [notice]);

  const showNotice = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  };

  const makeSchedule = () => {
    let ordered = [...jobs];
    if (strategy === "Earliest due date") ordered.sort((a, b) => a.Due.localeCompare(b.Due));
    else if (strategy === "Shortest processing time") ordered.sort((a, b) => a["Duration (min)"] - b["Duration (min)"]);
    else if (strategy === "Priority first") ordered.sort((a, b) => PRIORITY_RANK[a.Priority] - PRIORITY_RANK[b.Priority] || a.Due.localeCompare(b.Due));
    else ordered.sort((a, b) => PRIORITY_RANK[a.Priority] - PRIORITY_RANK[b.Priority] || a["Duration (min)"] - b["Duration (min)"]);

    const workforce = availableOperators.length ? availableOperators : operators;
    const baseTime = Date.now();
    const scheduled = ordered.map((job, index) => {
      const operator = workforce[index % (workforce.length || 1)];
      const assigned = operator ? `${operator.Operator} (${operator["Operator ID"]})` : "Unassigned";
      const recommended = new Date(baseTime + index * 12 * 60_000);
      return { ...job, Workforce: assigned, Sequence: index + 1, "Recommended start": recommended.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) };
    });
    setJobs((current) => current.map((job) => scheduled.find((row) => row["Job ID"] === job["Job ID"]) ? { ...job, Workforce: scheduled.find((row) => row["Job ID"] === job["Job ID"]).Workforce } : job));
    setSchedule(scheduled);
    setRuns((value) => value + 1);
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLastSchedule(time);
    showNotice(`Demo schedule generated using: ${strategy}`);
  };

  const addTask = (event) => {
    event.preventDefault();
    const id = taskForm.id.trim() || nextJobId(jobs, archived);
    if (!taskForm.task.trim() || !taskForm.machine.trim()) return showNotice("Enter a task name and machine.");
    if ([...jobs, ...archived].some((job) => job["Job ID"].toLowerCase() === id.toLowerCase())) return showNotice("That Job ID is already in use.");
    const due = `${taskForm.dueDate} ${taskForm.dueTime}`;
    const duration = Number(taskForm.duration) * ({ Minutes: 1, Hours: 60, Days: 1440 }[taskForm.unit]);
    setJobs((current) => [...current, { "Job ID": id, Task: taskForm.task.trim(), Machine: taskForm.machine.trim(), Priority: taskForm.priority, "Duration (min)": duration, Due: due, Status: "Queued", Progress: 0, Workforce: "Unassigned" }]);
    setTaskForm({ id: "", task: "", machine: "", priority: "Low", duration: "30", unit: "Minutes", dueDate: new Date().toISOString().slice(0, 10), dueTime: "13:00" });
    showNotice(`${id} added to the queue.`);
  };

  const completeTask = (jobId = selectedJob) => {
    if (!jobId) return;
    const job = jobs.find((item) => item["Job ID"] === jobId);
    if (!job) return;
    setArchived((current) => [...current, { ...job, Status: "Completed", Progress: 100, "Completed at": new Date().toISOString() }]);
    setJobs((current) => current.filter((item) => item["Job ID"] !== jobId));
    setSelectedJob("");
    showNotice(`${jobId} completed and archived.`);
  };

  const addOperator = (event) => {
    event.preventDefault();
    const id = operatorForm.id.trim();
    const name = operatorForm.name.trim();
    if (!id || !name) return showNotice("Enter an operator ID and name.");
    if (operators.some((row) => row["Operator ID"].toLowerCase() === id.toLowerCase())) return showNotice("That operator ID is already in use.");
    if (operators.some((row) => row.Operator.toLowerCase() === name.toLowerCase())) return showNotice("An operator with that name already exists.");
    setOperators((current) => [...current, { "Operator ID": id, Operator: name, "Skill group": operatorForm.skill, Shift: operatorForm.shift, Availability: operatorForm.availability, "Assigned jobs": 0, Utilization: 0 }]);
    setOperatorForm({ id: "", name: "", skill: SKILLS[0], shift: "Shift 1", availability: "Available" });
    showNotice(`${name} added to the workforce.`);
  };

  const updateJob = (jobId, field, value) => setJobs((current) => current.map((job) => job["Job ID"] === jobId ? { ...job, [field]: field === "Duration (min)" || field === "Progress" ? Number(value) : value } : job));
  const onConstraintChange = (key) => setConstraints((current) => ({ ...current, [key]: !current[key] }));

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">DynamiQ</div>
          <nav aria-label="Main navigation">
            {PAGES.map((item) => <button className={`nav-link ${page === item ? "active" : ""}`} key={item} onClick={() => setPage(item)}>{item}</button>)}
          </nav>
        </div>
      </header>

      <main className="app-shell">
        <div className="page-heading">
          <div><h2>{page}</h2><p className="small-muted">Manufacturing intelligence / real-time operations workspace</p></div>
          <div className="live-date">● Live demo <span>·</span> {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</div>
        </div>
        {noticeMessage && <div className="toast" role="status">{noticeMessage}</div>}

        {page === "Overview" && <>
          <section className="hero"><div className="hero-pill">✦ REINFORCEMENT LEARNING · DYNAMIC SCHEDULING</div><h1>Make every machine minute count.</h1><p>Monitor production, prioritize tasks, and explore adaptive schedules from one intelligent workspace.</p></section>
          <div className="metric-grid three"><Metric label="Active jobs" value={running} foot="+2.4% vs previous shift" icon="◉"/><Metric label="Queued tasks" value={queued} foot="Awaiting machine allocation" icon="↗"/><Metric label="Completed today" value={archived.length + 24} foot="+8.1% production output" icon="✓"/></div>
          <section className="section"><h3 className="section-title">Live job queue</h3>
            {schedule ? <DataTable columns={completionColumns} rows={schedule}/> : activeJobs.length ? <DataTable columns={["Job ID", "Assigned Operator", "Task", "Machine", "Priority", "Due", "Status", "Progress"]}><>{activeJobs.map((job) => <tr key={job["Job ID"]}><td>{job["Job ID"]}</td><td>{job.Workforce}</td><td>{job.Task}</td><td>{job.Machine}</td><td>{job.Priority}</td><td>{job.Due}</td><td><StatusBadge status={job.Status}/></td><td>{job.Progress}%</td></tr>)}</></DataTable> : <div className="info-box">No active jobs in the live queue.</div>}
          </section>
          <p className="caption">Illustrative dashboard data. Connect a backend or trained policy to display live production values.</p>
        </>}

        {page === "Task Scheduling" && <>
          <p className="intro-copy">Optimize task order with a demo scheduling policy. This prototype demonstrates the workflow; it does not run a trained DQN model.</p>
          <div className="form-grid three">
            <Field label="Optimization objective"><select value={objective} onChange={(event) => setObjective(event.target.value)}><option>Balanced throughput</option><option>Minimize tardiness</option><option>Maximize machine utilization</option></select></Field>
            <Field label="Planning horizon"><select value={horizon} onChange={(event) => setHorizon(event.target.value)}><option>Next 2 hours</option><option>Current shift</option><option>Next 24 hours</option></select></Field>
            <Field label="Scheduling policy"><select value={strategy} onChange={(event) => setStrategy(event.target.value)}><option>DQN policy (demo)</option><option>Earliest due date</option><option>Shortest processing time</option><option>Priority first</option></select></Field>
          </div>
          <section className="constraints-panel"><strong>Scheduling constraints</strong><div className="constraint-grid"><label><input type="checkbox" checked={constraints.compatibility} onChange={() => onConstraintChange("compatibility")}/>Respect machine compatibility</label><label><input type="checkbox" checked={constraints.critical} onChange={() => onConstraintChange("critical")}/>Prioritize critical jobs</label><label><input type="checkbox" checked={constraints.overload} onChange={() => onConstraintChange("overload")}/>Avoid operator overload</label></div></section>
          <button className="primary-action" onClick={makeSchedule}>✨ Generate optimized schedule</button>
          {schedule && <section className="section schedule-section"><h3 className="section-title">Recommended task sequence</h3><DataTable columns={completionColumns} rows={schedule}/><div className="table-actions"><button className="secondary-action" onClick={() => downloadCsv(schedule, "optimized_schedule.csv")}>Download schedule CSV</button><span className="caption">Schedule generated at {lastSchedule} · Demo policy run #{runs}</span></div></section>}
        </>}

        {page === "Task Management" && <>
          <p className="intro-copy">Track work orders and add jobs to the live demo queue.</p>
          <details className="details-card"><summary>＋ Add a job</summary><form className="form-grid three add-form" onSubmit={addTask}>
            <Field label="Job ID"><input value={taskForm.id} placeholder={nextJobId(jobs, archived)} onChange={(event) => setTaskForm({ ...taskForm, id: event.target.value })}/></Field>
            <Field label="Task name"><input required value={taskForm.task} onChange={(event) => setTaskForm({ ...taskForm, task: event.target.value })}/></Field>
            <Field label="Machine"><input required value={taskForm.machine} onChange={(event) => setTaskForm({ ...taskForm, machine: event.target.value })}/></Field>
            <Field label="Priority"><select value={taskForm.priority} onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value })}>{["Low", "Medium", "High", "Critical"].map((value) => <option key={value}>{value}</option>)}</select></Field>
            <Field label="Duration"><div className="inline-fields"><input type="number" min="1" max="365" value={taskForm.duration} onChange={(event) => setTaskForm({ ...taskForm, duration: event.target.value })}/><select value={taskForm.unit} onChange={(event) => setTaskForm({ ...taskForm, unit: event.target.value })}><option>Minutes</option><option>Hours</option><option>Days</option></select></div></Field>
            <Field label="Due date and time"><div className="inline-fields"><input type="date" value={taskForm.dueDate} onChange={(event) => setTaskForm({ ...taskForm, dueDate: event.target.value })}/><input type="time" value={taskForm.dueTime} onChange={(event) => setTaskForm({ ...taskForm, dueTime: event.target.value })}/></div></Field>
            <div className="form-submit"><button className="primary-action compact" type="submit">Add job</button></div>
          </form></details>
          <section className="section"><h3 className="section-title">Work orders</h3>{activeJobs.length ? <><p className="caption">Edit task details directly in the table. Status is managed with the completion control below.</p><DataTable columns={["Job ID", "Task", "Machine", "Priority", "Duration (min)", "Due", "Status", "Progress", "Workforce"]}><>{activeJobs.map((job) => <tr key={job["Job ID"]}>
            <td><input aria-label="Job ID" value={job["Job ID"]} onChange={(event) => updateJob(job["Job ID"], "Job ID", event.target.value)} disabled/></td>
            <td><input aria-label="Task" value={job.Task} onChange={(event) => updateJob(job["Job ID"], "Task", event.target.value)}/></td>
            <td><input aria-label="Machine" value={job.Machine} onChange={(event) => updateJob(job["Job ID"], "Machine", event.target.value)}/></td>
            <td><select aria-label="Priority" value={job.Priority} onChange={(event) => updateJob(job["Job ID"], "Priority", event.target.value)}>{["Low", "Medium", "High", "Critical"].map((value) => <option key={value}>{value}</option>)}</select></td>
            <td><input aria-label="Duration" type="number" min="1" value={job["Duration (min)"]} onChange={(event) => updateJob(job["Job ID"], "Duration (min)", event.target.value)}/></td>
            <td><input aria-label="Due" value={job.Due} onChange={(event) => updateJob(job["Job ID"], "Due", event.target.value)}/></td>
            <td><StatusBadge status={job.Status}/></td><td><input aria-label="Progress" type="number" min="0" max="100" value={job.Progress} onChange={(event) => updateJob(job["Job ID"], "Progress", event.target.value)}/></td>
            <td><input aria-label="Workforce" value={job.Workforce} onChange={(event) => updateJob(job["Job ID"], "Workforce", event.target.value)}/></td>
          </tr>)}</></DataTable></> : <div className="info-box">No pending tasks. Completed tasks are archived in the database.</div>}</section>
          <section className="section completion-panel"><h3 className="section-title">Complete a task</h3>{activeJobs.length ? <div className="complete-row"><select value={selectedJob || activeJobs[0]["Job ID"]} onChange={(event) => setSelectedJob(event.target.value)}>{activeJobs.map((job) => <option key={job["Job ID"]}>{job["Job ID"]}</option>)}</select><button className="primary-action compact" onClick={() => completeTask(selectedJob || activeJobs[0]["Job ID"])}>Mark task completed</button></div> : <div className="info-box">All tasks are completed and archived in the database.</div>}</section>
          <button className="secondary-action" onClick={() => downloadCsv(jobs, "jobs.csv")}>Export jobs CSV</button>
        </>}

        {page === "Workforce" && <>
          <p className="intro-copy">Operator availability and shift coverage (illustrative data).</p>
          <details className="details-card"><summary>Add an operator</summary><form className="form-grid three add-form" onSubmit={addOperator}>
            <Field label="Operator ID"><input required value={operatorForm.id} onChange={(event) => setOperatorForm({ ...operatorForm, id: event.target.value })}/></Field>
            <Field label="Operator name"><input required value={operatorForm.name} onChange={(event) => setOperatorForm({ ...operatorForm, name: event.target.value })}/></Field>
            <Field label="Skill group"><select value={operatorForm.skill} onChange={(event) => setOperatorForm({ ...operatorForm, skill: event.target.value })}>{SKILLS.map((skill) => <option key={skill}>{skill}</option>)}</select></Field>
            <Field label="Shift"><select value={operatorForm.shift} onChange={(event) => setOperatorForm({ ...operatorForm, shift: event.target.value })}>{["Shift 1", "Shift 2", "Shift 3"].map((shift) => <option key={shift}>{shift}</option>)}</select></Field>
            <Field label="Availability"><select value={operatorForm.availability} onChange={(event) => setOperatorForm({ ...operatorForm, availability: event.target.value })}>{["Available", "On task", "Break"].map((value) => <option key={value}>{value}</option>)}</select></Field>
            <div className="form-submit"><button className="primary-action compact" type="submit">Add operator</button></div>
          </form></details>
          <div className="metric-grid three workforce-metrics"><Metric label="Operators on shift" value={operators.filter((operator) => operator.Shift === "Shift 1").length} foot="Shift 1 · Plant A" icon="♙"/><Metric label="Available now" value={operators.filter((operator) => operator.Availability === "Available").length} foot="Ready for assignment" icon="✓"/><Metric label="Avg. utilization" value={`${Math.round(operators.length ? operators.reduce((sum, operator) => sum + Number(operator.Utilization), 0) / operators.length : 0)}%`} foot="Across listed operators" icon="◷"/></div>
          <section className="section"><DataTable columns={["Operator ID", "Operator", "Skill group", "Shift", "Availability", "Assigned jobs"]}><>{operators.map((operator) => <tr key={operator["Operator ID"]}><td>{operator["Operator ID"]}</td><td>{operator.Operator}</td><td>{operator["Skill group"]}</td><td>{operator.Shift}</td><td><StatusBadge status={operator.Availability}/></td><td>{operator["Assigned jobs"]}</td></tr>)}</></DataTable></section>
        </>}

        <footer>DynamiQ · Reinforcement Learning-Based Dynamic Task Scheduling System · Prototype dashboard</footer>
      </main>
    </>
  );
}

function Field({ label, children }) { return <label className="field"><span>{label}</span>{children}</label>; }
function StatusBadge({ status }) { return <span className={`status status-${status.toLowerCase()}`}>{status}</span>; }
function nextJobId(jobs, archived) {
  const ids = new Set([...jobs, ...archived].map((job) => job["Job ID"]));
  let candidate = 1048;
  while (ids.has(`JOB-${candidate}`)) candidate += 1;
  return `JOB-${candidate}`;
}
