import { useEffect, useRef, useState } from 'react'

const CATEGORIES = ['GENERAL VISITOR', 'VENDOR / SUPPLIER', 'DELIVERY', 'EMPLOYEE / INTER-UNIT', 'CONTRACTOR / SERVICE']
const REASONS = ['Meeting Visitor (General)', 'Conference / Seminar', 'Goods Delivery', 'Internship Candidate', 'Employee Guest', 'Maintenance or Service', 'Job Interview', 'Third Party Contractor/Service Provider', 'Lunch Delivery (at Reception)', 'Civil Construction Work']

const pktToday = () => new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10)
const fmtTime = (iso) => {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi' }).format(new Date(iso))
  } catch { return iso }
}
const emptyForm = () => ({
  visit_date: pktToday(), visitor_category: '', visitor_card_no: '', emp_code_cnic: '',
  person_name: '', mobile_no: '', coming_from: '', reason: '', other_reason: '',
  person_to_contact: '', department: '', previous_photo_path: '',
})

export default function App() {
  const [page, setPage] = useState('home')
  const [insideToday, setInsideToday] = useState([])
  const [allVisitors, setAllVisitors] = useState([])
  const [dash, setDash] = useState(null)
  const [suggest, setSuggest] = useState({ persons: [], departments: [] })
  const [form, setForm] = useState(emptyForm())
  const [editingId, setEditingId] = useState(null)
  const [notice, setNotice] = useState('')
  const [msg, setMsg] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [q, setQ] = useState('')
  const [formQ, setFormQ] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [cameraOn, setCameraOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [listLoading, setListLoading] = useState(false)
  const [confirmCreate, setConfirmCreate] = useState(false)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const cameraAttemptRef = useRef(false)
  const photoBoxRef = useRef(null)

  const loadInside = async () => { setListLoading(true); try { setInsideToday(await (await fetch('/api/visitors/inside-today')).json()) } finally { setListLoading(false) } }
  const loadAll = async (f = from, t = to, query = q) => {
    const p = new URLSearchParams()
    if (f) p.set('from', f); if (t) p.set('to', t); if (query) p.set('q', query)
    setListLoading(true); try { setAllVisitors(await (await fetch('/api/visitors/all?' + p.toString())).json()) } finally { setListLoading(false) }
  }
  const loadDash = async () => setDash(await (await fetch('/api/dashboard')).json())
  const loadSuggest = async () => setSuggest(await (await fetch('/api/suggestions')).json())

  useEffect(() => {
    loadSuggest()
    if (page === 'form') loadInside()
    if (page === 'summary') loadAll()
    if (page === 'dashboard' || page === 'home') loadDash()
  }, [page])

  const go = (p) => { if (page === 'create' && p !== 'create') stopCamera(); setMsg(''); setNotice(''); setPage(p) }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const stopCamera = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    streamRef.current = null; setCameraOn(false)
  }
  const openCamera = async () => {
    if (streamRef.current) { setCameraOn(true); return }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = s; setCameraOn(true)
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = s }, 50)
    } catch { setMsg('Camera not available on this device/browser, or permission was denied. Please use file upload instead, or tap Open Camera to try again.') }
  }
  // Camera goes live automatically when the Create Visitor form opens
  // (APEX-style: the live preview is already on screen, no Open Camera tap).
  // The browser asks for camera permission once; if it is denied, the
  // file-upload fallback below stays available.
  useEffect(() => {
    if (page === 'create' && !editingId && !cameraAttemptRef.current) {
      cameraAttemptRef.current = true
      openCamera()
    }
  }, [page, editingId])
  // Today's date (Pakistan) is picked automatically on a fresh create form.
  useEffect(() => {
    if (page === 'create' && !editingId) setForm(f => ({ ...f, visit_date: pktToday() }))
  }, [page, editingId])
  const capturePhoto = () => {
    const v = videoRef.current; if (!v) return
    const c = document.createElement('canvas'); c.width = v.videoWidth || 640; c.height = v.videoHeight || 480
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
    c.toBlob(b => {
      if (!b) return
      const f = new File([b], 'camera.jpg', { type: 'image/jpeg' })
      setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f)); stopCamera()
    }, 'image/jpeg', 0.9)
  }
  const onPhotoFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return
    setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f))
  }

  // Auto-fill (create mode ONLY — disabled in edit mode, like the APEX version).
  const autoFill = async () => {
    if (editingId) return
    const code = form.emp_code_cnic.trim(); if (!code) return
    const row = await (await fetch('/api/visitors/lookup?code=' + encodeURIComponent(code))).json()
    if (!row) { setNotice(''); return }
    const nf = { ...form }
    nf.visitor_category = CATEGORIES.includes(row.visitor_category) ? row.visitor_category : ''
    nf.visitor_card_no = row.visitor_card_no || ''
    nf.person_name = row.person_name || ''
    nf.mobile_no = row.mobile_no || ''
    nf.coming_from = row.coming_from || ''
    if (REASONS.includes(row.reason)) { nf.reason = row.reason; nf.other_reason = '' }
    else if (row.reason) { nf.reason = 'OTHER'; nf.other_reason = row.reason }
    nf.person_to_contact = row.person_to_contact || ''
    nf.department = row.department || ''
    nf.previous_photo_path = row.photo_path || ''
    setForm(nf)
    setNotice(`Previous visit found for ${code}. Details filled from the last visit (new date/time). All fields are editable.${row.photo_path ? ' Previous photo will be reused unless you capture/upload a new one.' : ''}`)
  }

  const startCreate = () => { setForm(emptyForm()); setEditingId(null); setPhotoFile(null); setPhotoPreview(''); setNotice(''); cameraAttemptRef.current = false; go('create') }
  const startEdit = async (id) => {
    const row = await (await fetch('/api/visitors/' + id)).json()
    const nf = emptyForm()
    nf.visit_date = row.visit_date; nf.visitor_category = row.visitor_category || ''
    nf.visitor_card_no = row.visitor_card_no || ''; nf.emp_code_cnic = row.emp_code_cnic || ''
    nf.person_name = row.person_name || ''; nf.mobile_no = row.mobile_no || ''; nf.coming_from = row.coming_from || ''
    if (REASONS.includes(row.reason)) { nf.reason = row.reason; nf.other_reason = '' }
    else if (row.reason) { nf.reason = 'OTHER'; nf.other_reason = row.reason }
    nf.person_to_contact = row.person_to_contact || ''; nf.department = row.department || ''
    nf.previous_photo_path = row.photo_path || ''
    setForm(nf); setEditingId(id); setPhotoFile(null); setPhotoPreview(''); setNotice('Edit mode: auto-fill is disabled. Time In / Time Out are preserved.'); go('create')
  }
  const outStamp = async (id, name) => {
    if (!window.confirm(`Stamp out ${name}?`)) return
    setBusy(true); try { await fetch(`/api/visitors/${id}/outstamp`, { method: 'POST' }) } finally { setBusy(false) }
    setMsg(`${name} stamped out.`); loadInside()
  }
  const deleteVisitor = async (id, name) => {
    if (!window.confirm(`Delete the record for ${name}? This cannot be undone. If it had a photo, the photo file is deleted too.`)) return
    setBusy(true); let res; try { res = await fetch(`/api/visitors/${id}`, { method: 'DELETE' }) } finally { setBusy(false) }
    if (!res.ok) return setMsg('Could not delete that record.')
    setMsg(`Record for ${name} deleted.`)
    if (page === 'summary') loadAll(); else loadInside()
  }
  const downloadCsv = () => {
    if (!allVisitors.length) return setMsg('No rows to download. Apply a filter first, or clear it to download everything.')
    const cols = ['Date', 'Category', 'Card No.', 'Emp Code / CNIC', 'Person Name', 'Mobile', 'Coming From', 'Reason', 'Person To Contact', 'Department', 'Time In', 'Time Out']
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [cols.map(esc).join(','), ...allVisitors.map(r => [r.visit_date, r.visitor_category, r.visitor_card_no, r.emp_code_cnic, r.person_name, r.mobile_no, r.coming_from, r.reason, r.person_to_contact, r.department, fmtTime(r.time_in), fmtTime(r.time_out)].map(esc).join(','))]
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `visitors-summary-${pktToday()}.csv`; a.click(); URL.revokeObjectURL(a.href)
    setMsg(`Excel file downloaded: ${allVisitors.length} rows (the current Summary filter).`)
  }
  const downloadPdf = async () => {
    if (!allVisitors.length) return setMsg('No rows to download. Apply a filter first, or clear it to download everything.')
    setBusy(true)
    try {
      // Loaded only when PDF is actually requested, so the first page
      // load stays light and fast.
      const { jsPDF } = await import('jspdf')
      const autoTable = (await import('jspdf-autotable')).default
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
      doc.setFontSize(16); doc.text('Visitor Summary', 40, 36)
      doc.setFontSize(10); doc.text(`Filter: ${from || 'all dates'} to ${to || 'all dates'}  ·  Rows: ${allVisitors.length}  ·  Generated: ${pktToday()} (Pakistan)  ·  Photos are not included in the PDF — use the Excel download for the full list.`, 40, 54)
      autoTable(doc, {
        startY: 66,
        head: [['Date', 'Category', 'Card No.', 'Emp Code / CNIC', 'Person Name', 'Mobile', 'Coming From', 'Reason', 'Person To Contact', 'Department', 'Time In', 'Time Out']],
        body: allVisitors.map(r => [r.visit_date, r.visitor_category, r.visitor_card_no || '', r.emp_code_cnic || '', r.person_name, r.mobile_no || '', r.coming_from || '', r.reason || '', r.person_to_contact || '', r.department || '', fmtTime(r.time_in), fmtTime(r.time_out)]),
        styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
        headStyles: { fillColor: [43, 101, 115] },
      })
      doc.save(`visitors-summary-${pktToday()}.pdf`)
      setMsg(`PDF downloaded: ${allVisitors.length} rows (the current Summary filter).`)
    } finally { setBusy(false) }
  }
  const submitForm = (e) => {
    e.preventDefault(); setMsg('')
    if (!form.visitor_category) return setMsg('Please select a Visitor Category.')
    if (!form.person_name.trim()) return setMsg('Person Name is required.')
    if (form.reason === 'OTHER' && !form.other_reason.trim()) return setMsg('Please type the reason when Other is selected.')
    // New entries ask for confirmation first; edits save directly.
    if (!editingId) { setConfirmCreate(true); return }
    doSubmit()
  }
  const doSubmit = async () => {
    setConfirmCreate(false); setBusy(true)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => fd.append(k, v))
      if (photoFile) fd.append('photo', photoFile)
      const url = editingId ? `/api/visitors/${editingId}` : '/api/visitors'
      const res = await fetch(url, { method: editingId ? 'PUT' : 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) return setMsg(data.error || 'Could not save. Please check the form.')
      setMsg(editingId ? 'Row updated.' : 'Visitor created.')
      stopCamera()
      await loadSuggest(); go('form')
    } finally { setBusy(false) }
  }

  const photoSrc = photoPreview || form.previous_photo_path || ''
  // Visitor Form filter: matches ANY field of a row (name, code, card,
  // company, department, reason, contact, mobile, category, date, times).
  const filteredInside = insideToday.filter(r => {
    const query = formQ.trim().toLowerCase(); if (!query) return true
    const hay = [r.visit_date, r.visitor_category, r.visitor_card_no, r.emp_code_cnic, r.person_name, r.mobile_no, r.coming_from, r.reason, r.person_to_contact, r.department, fmtTime(r.time_in), fmtTime(r.time_out)].join(' ').toLowerCase()
    return hay.includes(query)
  })
  const Bar = ({ items }) => {
    const max = Math.max(1, ...items.map(i => i.n))
    return <div className="bars">{items.map(i => (
      <div className="bar-row" key={i.name}><span className="bar-label">{i.name || '(blank)'}</span>
        <div className="bar-track"><div className="bar-fill" style={{ width: `${(i.n / max) * 100}%` }} /></div>
        <span className="bar-n">{i.n}</span></div>))}</div>
  }
  const table = (rows, actionsMode, loading) => (
    <div className="table-wrap"><table>
      <thead><tr><th>Date</th><th>Category</th><th>Card No.</th><th>Emp Code / CNIC</th><th>Person Name</th><th>Mobile</th><th>Coming From</th><th>Reason</th><th>Person To Contact</th><th>Department</th><th>Time In</th><th>Time Out</th><th>Photo</th>{actionsMode && <th>Action</th>}</tr></thead>
      <tbody>{rows.length === 0 ? <tr><td colSpan={actionsMode ? 14 : 13} className="empty">{loading ? 'Loading…' : 'No records found.'}</td></tr> : rows.map(r => (
        <tr key={r.id}><td>{r.visit_date}</td><td>{r.visitor_category}</td><td>{r.visitor_card_no || '—'}</td><td>{r.emp_code_cnic || '—'}</td><td>{r.person_name}</td><td>{r.mobile_no || '—'}</td><td>{r.coming_from || '—'}</td><td>{r.reason || '—'}</td><td>{r.person_to_contact || '—'}</td><td>{r.department || '—'}</td><td>{fmtTime(r.time_in)}</td><td>{fmtTime(r.time_out)}</td>
          <td>{r.photo_path ? <img src={r.photo_path} alt="" className="thumb" /> : '—'}</td>
          {actionsMode && <td className="actions">
            {actionsMode === 'form' && !r.time_out && <button className="btn small" onClick={() => outStamp(r.id, r.person_name)}>OutStamp</button>}
            {actionsMode === 'form' && <button className="btn small ghost" onClick={() => startEdit(r.id)}>Edit</button>}
            <button className="btn small ghost danger" onClick={() => deleteVisitor(r.id, r.person_name)}>Delete</button></td>}</tr>))}</tbody>
    </table></div>
  )

  return (
    <div className={`app${busy ? ' busy' : ''}`}>
      {busy && <div className="loading-bar">⏳ Working… please wait</div>}
      <header className="brand"><div className="brand-inner"><div><h1>Artistic Milliners Pvt Ltd</h1></div></div></header>
      <nav className="nav">
        <button className={page === 'home' ? 'active' : ''} onClick={() => go('home')}>Home</button>
        <button className={page === 'form' || page === 'create' ? 'active' : ''} onClick={() => go('form')}>Visitor Form</button>
        <button className={page === 'summary' ? 'active' : ''} onClick={() => go('summary')}>Summary</button>
        <button className={page === 'dashboard' ? 'active' : ''} onClick={() => go('dashboard')}>Dashboard</button>
      </nav>
      <main className="main">
        {msg && <div className="msg">{msg}</div>}

        {page === 'home' && <>
          <section className="hero"><div className="hero-text"><h2>Welcome to the Visitor Management System</h2>
            <button className="btn primary" onClick={startCreate}>+ Create Visitor</button>
            <button className="btn" onClick={() => go('form')}>Visitor Form</button></div>
            <div className="hero-art"><span>🏢</span><p>Reception</p></div></section>
          {dash && <section className="kpis">
            <div className="kpi"><b>{dash.total_check_in}</b><span>Total Check-In</span></div>
            <div className="kpi"><b>{dash.total_check_out}</b><span>Total Check-Out</span></div>
            <div className="kpi"><b>{dash.balance}</b><span>Balance (Inside)</span></div>
            <div className="kpi"><b>{dash.today_check_in}</b><span>Today Check-In</span></div>
            <div className="kpi"><b>{dash.today_check_out}</b><span>Today Check-Out</span></div>
          </section>}
        </>}

        {page === 'form' && <>
          <div className="page-head"><h2>Visitor Form</h2>
            <button className="btn primary" onClick={startCreate}>+ Create Visitor</button></div>
          <div className="filters">
            <input className="search" placeholder="Filter by anything: name, code, card, company, department, reason, contact, mobile…" value={formQ} onChange={e => setFormQ(e.target.value)} />
            {formQ && <button className="btn small ghost" onClick={() => setFormQ('')}>Clear Filter</button>}
          </div>
          {table(filteredInside, 'form', listLoading)}
        </>}

        {page === 'create' && <>
          <div className="page-head"><h2>{editingId ? 'Edit Visitor' : 'Create Visitor'}</h2>{editingId && <p>Edit a saved entry. Auto-fill is off in edit mode.</p>}</div>
          {notice && <div className="notice">{notice}</div>}
          <form className="form-grid" onSubmit={submitForm}>
            <label className="span3">Date *<input type="date" value={form.visit_date} onChange={e => set('visit_date', e.target.value)} required /></label>
            <label className="span9">Visitor Category *<select value={form.visitor_category} onChange={e => set('visitor_category', e.target.value)} required><option value="">Select Category</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
            <label className="span4">Visitor Card No.<input value={form.visitor_card_no} onChange={e => set('visitor_card_no', e.target.value)} /></label>
            <label className="span8">Company Emp Code / CNIC No.<input value={form.emp_code_cnic} onChange={e => set('emp_code_cnic', e.target.value)} onBlur={autoFill} placeholder="Enter Emp Code / CNIC No." /></label>
            <label className="span4">Person Name *<input value={form.person_name} onChange={e => set('person_name', e.target.value)} required /></label>
            <label className="span4">Mobile No.<input value={form.mobile_no} onChange={e => set('mobile_no', e.target.value)} /></label>
            <label className="span4">Coming From / Company Name<input value={form.coming_from} onChange={e => set('coming_from', e.target.value)} /></label>
            <label className="span12 reason-field">Reason *<select value={form.reason} onChange={e => set('reason', e.target.value)} required><option value="">Select Reason</option>{REASONS.map(r => <option key={r}>{r}</option>)}<option value="OTHER">Other</option></select></label>
            {form.reason === 'OTHER' && <label className="span12">Reason (Other) *<input value={form.other_reason} onChange={e => set('other_reason', e.target.value)} placeholder="Type the reason here — this exact text will be saved" /></label>}
            <label className="span5">Person To Be Contacted<input list="persons" value={form.person_to_contact} onChange={e => set('person_to_contact', e.target.value)} placeholder="Type or pick a previous value" /><datalist id="persons">{suggest.persons.map(p => <option key={p} value={p} />)}</datalist></label>
            <label className="span5">Department<input list="depts" value={form.department} onChange={e => set('department', e.target.value)} placeholder="Type or pick a previous value" /><datalist id="depts">{suggest.departments.map(d => <option key={d} value={d} />)}</datalist></label>
            <div className="span2 take-photo-cell"><button type="button" className="btn primary" onClick={() => { photoBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); openCamera() }}>Take Photo</button></div>
            <div className="span12 photo-box" ref={photoBoxRef}><h3>Take Photo</h3>
              {cameraOn ? <><video ref={videoRef} autoPlay playsInline className="video" /><div className="row"><button type="button" className="btn primary" onClick={capturePhoto}>Capture</button><button type="button" className="btn ghost" onClick={stopCamera}>Stop</button></div></>
                : <div className="row"><button type="button" className="btn" onClick={openCamera}>Open Camera</button><label className="btn ghost file-btn">Upload File<input type="file" accept="image/*" hidden onChange={onPhotoFile} /></label><span className="hint">Camera starts automatically on this form — allow it once when the browser asks. If it is blocked, use Upload File or Open Camera.</span></div>}
              {photoSrc ? <img src={photoSrc} alt="Visitor" className="preview" /> : <div className="no-photo">No photo yet</div>}
            </div>
            <div className="span12 row form-actions">
              <button className="btn ghost" type="button" onClick={() => { stopCamera(); go('form') }}>Cancel</button>
              <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Saving…' : (editingId ? 'Save Changes' : 'Create Visitor')}</button>
            </div>
          </form>
        </>}

        {page === 'summary' && <>
          <div className="page-head"><h2>Summary</h2></div>
          <div className="filters">
            <label>From Date<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
            <label>To Date<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
            <button className="btn small primary" onClick={() => loadAll()}>Apply</button>
            <button className="btn small ghost" onClick={() => { setFrom(''); setTo(''); setQ(''); loadAll('', '', '') }}>Clear</button>
            <input className="search" placeholder="Search by anything: name, code, card, company, department, reason, contact, mobile…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') loadAll() }} />
            <button className="btn small" onClick={() => loadAll()}>Search</button>
            <button className="btn small primary" onClick={downloadPdf}>Download PDF</button>
            <button className="btn small primary" onClick={downloadCsv}>Download Excel</button>
          </div>
          {table(allVisitors, 'summary', listLoading)}
        </>}

        {page === 'dashboard' && dash && <>
          <div className="page-head"><h2>Dashboard</h2><p>Live counts from Supabase. Today is Pakistan time ({dash.today_pkt}).</p></div>
          <section className="kpis">
            <div className="kpi"><b>{dash.total_check_in}</b><span>Total Check-In</span></div>
            <div className="kpi"><b>{dash.total_check_out}</b><span>Total Check-Out</span></div>
            <div className="kpi"><b>{dash.balance}</b><span>Balance (Inside)</span></div>
            <div className="kpi"><b>{dash.today_check_in}</b><span>Today Check-In</span></div>
            <div className="kpi"><b>{dash.today_check_out}</b><span>Today Check-Out</span></div>
          </section>
          <div className="charts"><div className="chart-card"><h3>By Department</h3><Bar items={dash.by_department} /></div>
            <div className="chart-card"><h3>By Visitor Category</h3><Bar items={dash.by_category} /></div></div>
        </>}
      </main>
      {confirmCreate && <div className="modal-overlay"><div className="modal-card">
        <h3>Confirm new visitor</h3>
        <p><b>{form.person_name}</b> — {form.visitor_category}<br />
          Date: {form.visit_date}{form.emp_code_cnic ? <> · Code: {form.emp_code_cnic}</> : null}{form.coming_from ? <> · From: {form.coming_from}</> : null}<br />
          Reason: {form.reason === 'OTHER' ? form.other_reason : form.reason}</p>
        <p>Is entry ko save karna hai?</p>
        <div className="row form-actions">
          <button className="btn ghost" type="button" onClick={() => setConfirmCreate(false)}>Cancel</button>
          <button className="btn primary" type="button" onClick={doSubmit}>Confirm &amp; Create</button>
        </div>
      </div></div>}
    </div>
  )
}
