import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownWideNarrow, CalendarDays, Check, ChevronDown, CircleHelp, ClipboardList, Clock3, LayoutDashboard, LogOut, Menu, MoreHorizontal, Plus, Search, SlidersHorizontal, Stethoscope, Users, X } from 'lucide-react';

const options = {
  gender: ['Female', 'Male', 'Non-binary', 'Prefer not to say'],
  ward: ['General', 'ICU', 'Maternity', 'Pediatrics', 'Surgery', 'Emergency'],
  department: ['Cardiology', 'General Medicine', 'Neurology', 'Oncology', 'Orthopedics', 'Pediatrics', 'Surgery'],
  doctor: ['Dr. A. Mehta', 'Dr. R. Sharma', 'Dr. P. Iyer', 'Dr. S. Khan', 'Dr. N. Rao', 'Dr. K. Patel'],
};
const emptyForm = () => ({ name: '', age: '', gender: '', ward: '', department: '', doctor: '', admission_date: new Date().toISOString().slice(0, 10) });
const dateLabel = value => new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

async function request(url, init) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.message || 'Something went wrong.'), { body });
  return body;
}

function App() {
  const [patients, setPatients] = useState([]);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({ ward: '', department: '', doctor: '' });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [menuFor, setMenuFor] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search: query, ...filters });
      const data = await request(`/api/patients?${params}`);
      setPatients(data.patients);
    } catch {
      setNotice('Can’t reach the patient service. Start the Python API and try again.');
    } finally { setLoading(false); }
  }, [query, filters]);
  useEffect(() => { const timer = setTimeout(refresh, 220); return () => clearTimeout(timer); }, [refresh]);

  const stats = useMemo(() => ({ total: patients.length, admitted: patients.filter(p => p.status === 'Admitted').length,
    discharged: patients.filter(p => p.status === 'Discharged').length,
    wards: new Set(patients.filter(p => p.status === 'Admitted').map(p => p.ward)).size }), [patients]);

  function openAdd() { setForm(emptyForm()); setErrors({}); setModal({ type: 'add' }); }
  function openEdit(patient) { setForm({ name: patient.name, age: String(patient.age), gender: patient.gender, ward: patient.ward, department: patient.department, doctor: patient.doctor, admission_date: patient.admission_date }); setErrors({}); setModal({ type: 'edit', patient }); }
  function change(field, value) { setForm(old => ({ ...old, [field]: value })); setErrors(old => ({ ...old, [field]: undefined })); }
  async function save(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!/^[A-Za-z ]+$/.test(form.name.trim())) nextErrors.name = 'Use letters and spaces only.';
    if (form.age === '' || !/^\d+$/.test(String(form.age)) || Number(form.age) > 120) nextErrors.age = 'Enter a whole number from 0 to 120.';
    for (const key of ['gender', 'ward', 'department', 'doctor']) if (!form[key]) nextErrors[key] = 'Please select an option.';
    if (!form.admission_date || form.admission_date > new Date().toISOString().slice(0, 10)) nextErrors.admission_date = 'Choose a date that is not in the future.';
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    setSaving(true);
    try {
      const edit = modal.type === 'edit';
      await request(edit ? `/api/patients/${modal.patient.id}` : '/api/patients', { method: edit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      setModal(null); setNotice(edit ? 'Patient record updated.' : 'Patient admitted successfully.'); refresh();
    } catch (error) { setErrors(error.body?.errors || { form: error.message }); }
    finally { setSaving(false); }
  }
  async function discharge(patient) {
    try { await request(`/api/patients/${patient.id}`, { method: 'PATCH' }); setNotice(`${patient.name} marked as discharged.`); refresh(); }
    catch (error) { setNotice(error.message); }
    setMenuFor(null);
  }
  async function remove(patient) {
    if (!window.confirm(`Delete ${patient.name}’s patient record? This cannot be undone.`)) return;
    try { await request(`/api/patients/${patient.id}`, { method: 'DELETE' }); setNotice('Patient record deleted.'); refresh(); }
    catch (error) { setNotice(error.message); }
    setMenuFor(null);
  }

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand"><span className="brand-mark"><Activity size={20} strokeWidth={2.6} /></span><span>careflow<span className="brand-dot">.</span></span></div>
      <div className="nav-label">WORKSPACE</div>
      <nav><button className="nav-item active"><LayoutDashboard size={18} /> Overview</button><button className="nav-item"><Users size={18} /> Patients <span className="nav-count">{stats.total}</span></button><button className="nav-item"><CalendarDays size={18} /> Admissions</button><button className="nav-item"><ClipboardList size={18} /> Reports</button></nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><CircleHelp size={17} /></div><strong>Need a hand?</strong><p>Our team is here to help you.</p><button onClick={() => setNotice('Contact your hospital administrator for support.')}>Get support <span>↗</span></button></div><button className="profile"><span className="avatar">AS</span><span className="profile-copy"><strong>Admin Staff</strong><small>Hospital Admin</small></span><MoreHorizontal size={19} /></button></div>
    </aside>
    {mobileNav && <button className="scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle menu"><Menu size={20}/></button><div className="breadcrumbs">Workspace <span>/</span> <strong>Overview</strong></div><div className="top-actions"><span className="today-label"><Clock3 size={15}/>{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span><span className="top-avatar">AS</span></div></header>
      <div className="content">
        <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> HOSPITAL OPERATIONS</div><h1>Good morning<span className="greeting-period">.</span></h1><p className="page-subtitle">Here’s what’s happening with your patients today.</p></div><button className="primary-button" onClick={openAdd}><Plus size={17} strokeWidth={2.5}/> New admission</button></section>
        <section className="stats-grid" aria-label="Patient summary">
          <Stat title="Total patients" value={stats.total} note="In current view" icon={<Users size={19}/>} tone="blue"/>
          <Stat title="Currently admitted" value={stats.admitted} note="Receiving care" icon={<Activity size={19}/>} tone="green"/>
          <Stat title="Discharged" value={stats.discharged} note="Completed care" icon={<Check size={19}/>} tone="violet"/>
          <Stat title="Active wards" value={stats.wards} note="With admitted patients" icon={<Stethoscope size={19}/>} tone="amber"/>
        </section>
        <section className="patients-card">
          <div className="card-heading"><div><div className="section-kicker">CARE DIRECTORY</div><h2>Patient admissions <span className="count-pill">{patients.length}</span></h2><p className="card-caption">Manage and keep track of your patient records.</p></div><button className="secondary-button export-button" onClick={() => window.print()}><ArrowDownWideNarrow size={16}/> Export list</button></div>
          <div className="toolbar"><label className="search-box"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search patients by name…"/><kbd>⌘ K</kbd></label><div className="filter-label"><SlidersHorizontal size={16}/><span>Filter by</span></div>
            {['ward', 'department', 'doctor'].map(key => <label className="filter-select" key={key}><select value={filters[key]} onChange={e => setFilters(old => ({ ...old, [key]: e.target.value }))}><option value="">{key[0].toUpperCase() + key.slice(1)}</option>{options[key].map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={14}/></label>)}
            {Object.values(filters).some(Boolean) && <button className="clear-filters" onClick={() => setFilters({ ward: '', department: '', doctor: '' })}>Clear</button>}
          </div>
          <div className="table-wrap"><table><thead><tr><th>PATIENT</th><th>WARD / DEPARTMENT</th><th>DOCTOR</th><th>ADMITTED</th><th>STATUS</th><th></th></tr></thead>
            <tbody>{loading ? <tr><td colSpan="6" className="state-cell"><span className="spinner"/>Loading patient records…</td></tr> : patients.length === 0 ? <tr><td colSpan="6"><div className="empty-state"><div className="empty-icon"><Users size={22}/></div><strong>No patient records yet</strong><span>Add a new admission to get your directory started.</span><button className="primary-button small" onClick={openAdd}><Plus size={15}/> New admission</button></div></td></tr> : patients.map((patient, index) => <tr key={patient.id}><td><div className="patient-cell"><span className={`patient-avatar avatar-${index % 5}`}>{patient.name.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase()}</span><span className="patient-name"><strong>{patient.name}</strong><small>{patient.age} years <i/> {patient.gender}</small></span></div></td><td><strong className="ward-name">{patient.ward}</strong><span className="cell-secondary">{patient.department}</span></td><td><span className="doctor-name">{patient.doctor}</span></td><td><span className="date-text">{dateLabel(patient.admission_date)}</span></td><td><span className={`status-badge ${patient.status === 'Admitted' ? 'status-admitted' : 'status-discharged'}`}><i/>{patient.status}</span></td><td className="row-actions"><button className="more-button" aria-label={`Actions for ${patient.name}`} onClick={() => setMenuFor(menuFor === patient.id ? null : patient.id)}><MoreHorizontal size={19}/></button>{menuFor === patient.id && <div className="row-menu"><button onClick={() => { openEdit(patient); setMenuFor(null); }}>Edit patient</button>{patient.status === 'Admitted' && <button onClick={() => discharge(patient)}>Mark discharged</button>}<button className="danger-option" onClick={() => remove(patient)}>Delete patient</button></div>}</td></tr>)}</tbody>
          </table></div>
          <div className="table-footer"><span>Showing <strong>{patients.length ? 1 : 0}–{patients.length}</strong> of <strong>{patients.length}</strong> patients</span><span className="footer-note"><span className="live-dot"/> All records up to date</span></div>
        </section>
        <footer className="page-footer"><span>© {new Date().getFullYear()} Careflow Health Systems</span><span>Patient care, thoughtfully managed <Activity size={14}/></span></footer>
      </div>
    </main>
    {notice && <div className="toast" role="status"><span className="toast-check"><Check size={14}/></span>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={15}/></button></div>}
    {modal && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setModal(null)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><div className="section-kicker">PATIENT RECORD</div><h2 id="modal-title">{modal.type === 'edit' ? 'Edit patient' : 'New admission'}</h2><p>{modal.type === 'edit' ? 'Update the patient’s admission details.' : 'Enter the details to add a patient to your directory.'}</p></div><button className="icon-button close-button" onClick={() => setModal(null)} aria-label="Close"><X size={19}/></button></div><form onSubmit={save} noValidate><div className="form-grid">
          <Field label="Patient name" error={errors.name} wide><input autoFocus value={form.name} onChange={e => change('name', e.target.value)} placeholder="e.g. Aisha Kapoor" /></Field>
          <Field label="Age" error={errors.age}><input type="number" min="0" max="120" value={form.age} onChange={e => change('age', e.target.value)} placeholder="Age in years" /></Field>
          <Field label="Gender" error={errors.gender}><Select value={form.gender} onChange={v => change('gender', v)} placeholder="Select gender" items={options.gender}/></Field>
          <Field label="Ward" error={errors.ward}><Select value={form.ward} onChange={v => change('ward', v)} placeholder="Select ward" items={options.ward}/></Field>
          <Field label="Department" error={errors.department}><Select value={form.department} onChange={v => change('department', v)} placeholder="Select department" items={options.department}/></Field>
          <Field label="Doctor" error={errors.doctor}><Select value={form.doctor} onChange={v => change('doctor', v)} placeholder="Select doctor" items={options.doctor}/></Field>
          <Field label="Admission date" error={errors.admission_date}><input type="date" max={new Date().toISOString().slice(0,10)} value={form.admission_date} onChange={e => change('admission_date', e.target.value)}/></Field>
        </div>{errors.form && <p className="form-error">{errors.form}</p>}<div className="modal-footer"><span><span className="required-star">*</span> All fields are required</span><div><button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : modal.type === 'edit' ? 'Save changes' : <><Plus size={16}/> Add patient</>}</button></div></div></form></section></div>}
  </div>;
}

function Stat({ title, value, note, icon, tone }) { return <article className="stat-card"><span className={`stat-icon tone-${tone}`}>{icon}</span><div className="stat-title">{title}</div><div className="stat-value">{value}<span className={`stat-indicator tone-${tone}`}><Activity size={13}/></span></div><div className="stat-note">{note}</div></article>; }
function Field({ label, error, wide, children }) { return <label className={`form-field ${wide ? 'field-wide' : ''} ${error ? 'has-error' : ''}`}><span>{label}<b>*</b></span>{children}{error && <small>{error}</small>}</label>; }
function Select({ value, onChange, placeholder, items }) { return <span className="select-control"><select value={value} onChange={e => onChange(e.target.value)}><option value="">{placeholder}</option>{items.map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={15}/></span>; }

export default App;
