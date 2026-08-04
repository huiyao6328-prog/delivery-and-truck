'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'

export default function DashboardPage() {
  const [stats, setStats] = useState({
    trucks: 0,
    drivers: 0,
    dispatchesToday: 0,
    inspectionsToday: 0,
    issuesToday: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    const today = new Date().toISOString().slice(0, 10)
    const [trucks, drivers, dispatchesToday, inspectionsToday, issuesToday] = await Promise.all([
      supabase.from('trucks').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('employees').select('*', { count: 'exact', head: true }).eq('is_driver', true).eq('is_active', true),
      supabase.from('dispatches').select('*', { count: 'exact', head: true }).eq('dispatch_date', today),
      supabase.from('inspections').select('*', { count: 'exact', head: true }).eq('inspection_date', today),
      supabase.from('inspections').select('*', { count: 'exact', head: true }).eq('inspection_date', today).eq('overall_result', 'issues_found'),
    ])
    setStats({
      trucks: trucks.count || 0,
      drivers: drivers.count || 0,
      dispatchesToday: dispatchesToday.count || 0,
      inspectionsToday: inspectionsToday.count || 0,
      issuesToday: issuesToday.count || 0,
    })
    setLoading(false)
  }

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">Fleet overview for today</div>
        </div>
      </div>
      {loading ? (
        <div className="loading"><div className="spinner" /><span>Loading…</span></div>
      ) : (
        <div className="stat-cards">
          <div className="stat-card">
            <div className="stat-label">Active Trucks</div>
            <div className="stat-value">{stats.trucks}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Active Drivers</div>
            <div className="stat-value">{stats.drivers}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Dispatches Today</div>
            <div className="stat-value">{stats.dispatchesToday}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Inspections Today</div>
            <div className="stat-value">{stats.inspectionsToday}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Issues Flagged Today</div>
            <div className="stat-value" style={{ color: stats.issuesToday > 0 ? '#f2977e' : '#e9eef3' }}>
              {stats.issuesToday}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
