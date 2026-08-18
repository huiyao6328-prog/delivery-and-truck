'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { useSession, clearSession, access } from '@/lib/useSession'

const BASE = '/admin'

const navItems: { label: string; href: string; functionCode: string }[] = [
  { label: 'Dashboard', href: BASE, functionCode: '__dashboard__' },
  { label: 'Employees', href: `${BASE}/employees`, functionCode: 'employees' },
  { label: 'Permission Groups', href: `${BASE}/permission-groups`, functionCode: 'permissions' },
  { label: 'Truck Types', href: `${BASE}/truck-types`, functionCode: 'truck_types' },
  { label: 'Truck Owners', href: `${BASE}/truck-owners`, functionCode: 'truck_owners' },
  { label: 'Trucks', href: `${BASE}/trucks`, functionCode: 'trucks' },
  { label: 'Dispatch Records', href: `${BASE}/dispatches`, functionCode: 'dispatches' },
  { label: 'Daily Inspections', href: `${BASE}/inspections`, functionCode: 'inspections' },
  { label: 'Improvement Progress', href: `${BASE}/improvement-progress`, functionCode: 'improvement_progress' },
  { label: 'Inspection Settings', href: `${BASE}/inspection-settings`, functionCode: 'inspection_settings' },
  { label: 'Carton Types', href: `${BASE}/pack-boxes`, functionCode: 'pack_boxes' },
  { label: 'Load Calculator', href: `${BASE}/load-calculator`, functionCode: 'load_calculator' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { session, loading } = useSession({ requireBackOffice: true })

  function handleLogout() {
    clearSession()
    router.push('/login')
  }

  if (loading || !session) {
    return (
      <div className="loading" style={{ minHeight: '100vh' }}>
        <div className="spinner" />
        <span>Loading…</span>
        <style jsx global>{globalStyles}</style>
      </div>
    )
  }

  const visibleItems = navItems.filter(
    (item) => item.functionCode === '__dashboard__' || access(session, item.functionCode) !== 'none'
  )

  return (
    <div className="admin-shell">
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <span className="logo-mark">DT</span>
            <div>
              <div className="logo-title">Delivery &amp; Truck</div>
              <div className="logo-sub">Back Office</div>
            </div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {visibleItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="nav-label">{item.label}</span>
              </Link>
            )
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">{session.employee.full_name}</div>
          <button className="logout-btn" onClick={handleLogout}>Log Out</button>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle menu">
            ☰
          </button>
          <div className="topbar-right">
            <Link href="/account" className="topbar-account">Account</Link>
            <span className="topbar-user">{session.employee.full_name} · {session.employee.code}</span>
          </div>
        </header>
        <main className="admin-content">{children}</main>
      </div>
      <style jsx global>{globalStyles}</style>
    </div>
  )
}

const globalStyles = `
  * { box-sizing: border-box; }
  body { background: #0f1b28; }
  .admin-shell { display: flex; min-height: 100vh; }
  .admin-sidebar {
    width: 240px; min-height: 100vh;
    background: #0a141e; color: #a7b4c2;
    display: flex; flex-direction: column;
    position: fixed; left: 0; top: 0; bottom: 0;
    z-index: 100; transition: transform 0.25s ease;
  }
  .sidebar-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 99; }
  .sidebar-header { padding: 20px 20px 16px; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .sidebar-logo { display: flex; align-items: center; gap: 12px; }
  .logo-mark {
    width: 38px; height: 38px; background: #c85a26; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-family: var(--font-mono); font-size: 14px; font-weight: 700; color: white; flex-shrink: 0;
  }
  .logo-title { font-size: 14px; font-weight: 700; color: white; line-height: 1.3; }
  .logo-sub { font-size: 11px; color: #7c84a3; margin-top: 2px; }
  .sidebar-nav { flex: 1; padding: 10px; display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }
  .nav-item {
    display: flex; align-items: center; padding: 9px 12px; border-radius: 8px;
    color: #a7b4c2; text-decoration: none; font-size: 13.5px; font-weight: 500;
    transition: all 0.15s;
  }
  .nav-item:hover { background: rgba(255,255,255,0.06); color: #edf1f4; }
  .nav-item.active { background: rgba(200,90,38,0.18); color: #ef8c56; }
  .sidebar-footer { padding: 14px 16px; border-top: 1px solid rgba(255,255,255,0.08); }
  .sidebar-user { font-size: 12.5px; color: #edf1f4; font-weight: 600; margin-bottom: 8px; }
  .logout-btn {
    width: 100%; padding: 7px 12px; background: none; border: 1px solid rgba(255,255,255,0.15);
    border-radius: 8px; color: #a7b4c2; font-size: 12.5px; cursor: pointer;
  }
  .logout-btn:hover { background: rgba(239,68,68,0.12); color: #f2977e; border-color: rgba(242,151,126,0.3); }
  .admin-main { margin-left: 240px; flex: 1; display: flex; flex-direction: column; min-height: 100vh; }
  .admin-topbar {
    height: 56px; background: #16232f; border-bottom: 1px solid #28394a;
    display: flex; align-items: center; justify-content: space-between; padding: 0 24px;
    position: sticky; top: 0; z-index: 50;
  }
  .menu-toggle { display: none; background: none; border: none; cursor: pointer; font-size: 18px; color: #e9eef3; }
  .topbar-right { display: flex; align-items: center; gap: 14px; }
  .topbar-account { font-size: 13px; color: #7fb2ff; text-decoration: none; }
  .topbar-account:hover { text-decoration: underline; }
  .topbar-user { font-size: 13.5px; color: #93a4b6; font-weight: 600; }
  .admin-content { padding: 28px 32px; flex: 1; }
  @media (max-width: 768px) {
    .admin-sidebar { transform: translateX(-100%); }
    .admin-sidebar.open { transform: translateX(0); }
    .sidebar-overlay { display: block; }
    .admin-main { margin-left: 0; }
    .menu-toggle { display: block; }
    .admin-content { padding: 18px 16px; }
  }
  .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; flex-wrap: wrap; gap: 12px; }
  .page-title { font-size: 21px; font-weight: 700; color: #e9eef3; }
  .page-sub { font-size: 13px; color: #93a4b6; margin-top: 3px; }
  .btn {
    display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 8px;
    font-size: 13.5px; font-weight: 600; cursor: pointer; border: none; transition: all 0.15s; text-decoration: none;
  }
  .btn-primary { background: #c85a26; color: white; }
  .btn-primary:hover { background: #b04d1e; }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-secondary { background: #101a24; color: #e9eef3; border: 1px solid #28394a; }
  .btn-secondary:hover { background: #16232f; }
  .btn-danger { background: #3a2018; color: #f2977e; border: 1px solid #5a3226; }
  .btn-danger:hover { background: #4a281c; }
  .card { background: #16232f; border-radius: 12px; border: 1px solid #26374a; overflow: hidden; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  .data-table th {
    background: #101a24; padding: 10px 16px; text-align: left; font-size: 11.5px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.04em; color: #93a4b6; border-bottom: 1px solid #26374a; white-space: nowrap;
  }
  .data-table td { padding: 12px 16px; border-bottom: 1px solid #1e2c3a; color: #cdd8e3; vertical-align: middle; }
  .data-table tr:last-child td { border-bottom: none; }
  .data-table tr:hover td { background: #1a2836; }
  .badge { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 100px; font-size: 11.5px; font-weight: 600; }
  .badge-green { background: #e3efe4; color: #26592c; }
  .badge-red { background: #f8e2da; color: #9c3719; }
  .badge-blue { background: #dbeafe; color: #1e40af; }
  .badge-gray { background: #ece9df; color: #6b6252; }
  .badge-orange { background: #f6d9c8; color: #a64a1e; }
  .modal-overlay { position: fixed; inset: 0; background: rgba(4,9,14,0.6); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 20px; }
  .modal { background: #16232f; border-radius: 14px; width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.5); border: 1px solid #26374a; }
  .modal-header { padding: 20px 24px 0; display: flex; align-items: center; justify-content: space-between; }
  .modal-title { font-size: 17px; font-weight: 700; color: #e9eef3; }
  .modal-close { background: none; border: none; cursor: pointer; color: #93a4b6; font-size: 20px; line-height: 1; padding: 4px; }
  .modal-body { padding: 20px 24px 24px; }
  .form-group { margin-bottom: 16px; }
  .form-label { display: block; font-size: 12.5px; font-weight: 700; color: #93a4b6; margin-bottom: 6px; }
  .form-input, .form-select, .form-textarea {
    width: 100%; padding: 9px 12px; border: 1px solid #28394a; border-radius: 8px;
    font-size: 14px; color: #e9eef3; background: #101a24; outline: none; font-family: inherit;
  }
  .form-input:focus, .form-select:focus, .form-textarea:focus { border-color: #c85a26; box-shadow: 0 0 0 3px rgba(200,90,38,0.18); }
  .form-textarea { resize: vertical; min-height: 90px; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .modal-footer { display: flex; gap: 8px; justify-content: flex-end; padding-top: 16px; border-top: 1px solid #26374a; margin-top: 8px; }
  .empty-state { text-align: center; padding: 56px 20px; color: #64798d; font-size: 14px; }
  .loading { display: flex; align-items: center; justify-content: center; padding: 60px; color: #93a4b6; font-size: 14px; gap: 10px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner { width: 18px; height: 18px; border: 2px solid #28394a; border-top-color: #c85a26; border-radius: 50%; animation: spin 0.7s linear infinite; }
  .table-wrap { overflow-x: auto; }
  .actions { display: flex; gap: 6px; }
  .action-btn { padding: 5px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: none; }
  .action-edit { background: #1c3352; color: #7fb2ff; }
  .action-edit:hover { background: #24406a; }
  .action-delete { background: #3a2018; color: #f2977e; }
  .action-delete:hover { background: #4a281c; }
  .stat-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 26px; }
  .stat-card { background: #16232f; border-radius: 12px; padding: 20px; border: 1px solid #26374a; }
  .stat-label { font-size: 12.5px; color: #93a4b6; margin-bottom: 6px; }
  .stat-value { font-family: var(--font-mono); font-size: 27px; font-weight: 700; color: #e9eef3; }
`
