import React, { useState } from 'react';

// ── Sample AJR Data ──────────────────────────────────────────────────────────
const PROJECT = {
  name: 'Sunset Plaza High School',
  status: 'In Progress',
  address: '123 Sunset Blvd Mason Los Angeles, CA 90028',
  image: '',
};

const FINANCIALS = {
  contractValue: 1207000,
  totalBudgetedExpenses: 847450,
  actualExpense: 106960,
  actualRevenue: 247000,
  costToComplete: 740490,
  budgetedMarginDollars: 359550,
  budgetedMarginPercent: 29.79,
};

const EXPENSE_CATEGORIES = [
  { name: 'Equipment', amount: 24000, color: '#2596be' },
  { name: 'Labor', amount: 61500, color: '#2596be' },
  { name: 'Materials', amount: 17500, color: '#2596be' },
  { name: 'Sub-Contractor', amount: 3000, color: '#2596be' },
  { name: 'Permit', amount: 960, color: '#2596be' },
  { name: 'Rentals', amount: 160, color: '#2596be' },
  { name: 'Other', amount: 50, color: '#2596be' },
  { name: 'Direct Costs', amount: 50, color: '#178a6e' },
];

const NAV_ITEMS = [
  { label: 'Dashboard', sub: 'Project Overview', active: false },
  { label: 'Financials', sub: 'Overview', active: true },
  { label: 'Jobs', sub: 'Booking, Jobs & Appointments', active: false },
  { label: 'Estimates', sub: 'Sold & Unsold Estimates', active: false },
  { label: 'Purchasing', sub: 'Purchase Order', active: false },
  { label: 'Technicians', sub: 'Team', active: false },
  { label: 'Project Plan', sub: 'Tasks & Jobs', active: false },
  { label: 'Documents', sub: 'Tasks & Jobs', active: false },
  { label: 'Daily Log', sub: 'Daily Log', active: false },
  { label: 'Change Orders', sub: 'Change Orders', active: false },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Donut Chart (SVG) ────────────────────────────────────────────────────────
function DonutChart({ percent }: { percent: number }) {
  const size = 160;
  const stroke = 28;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const revenuePercent = (FINANCIALS.actualRevenue / (FINANCIALS.actualRevenue + FINANCIALS.actualExpense + (FINANCIALS.actualRevenue - FINANCIALS.actualExpense))) * 100;
  const expensePercent = (FINANCIALS.actualExpense / FINANCIALS.actualRevenue) * 100;
  const marginPercent = percent;

  // Three segments: revenue (teal), expense (dark teal), margin (purple)
  const segments = [
    { pct: 43.3, color: '#2596be' },   // Revenue portion
    { pct: 21.7, color: '#1a7a9e' },   // Expense portion
    { pct: 35.0, color: '#7c5bbf' },   // Margin portion
  ];

  let offset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={stroke}
      />
      {segments.map((seg, i) => {
        const dashLen = (seg.pct / 100) * circumference;
        const dashOffset = -offset;
        offset += dashLen;
        return (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth={stroke}
            strokeDasharray={`${dashLen} ${circumference - dashLen}`}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dasharray 0.5s ease' }}
          />
        );
      })}
      <text
        x={size / 2}
        y={size / 2 - 6}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ fontSize: '20px', fontWeight: 700, fill: '#178a6e' }}
      >
        {percent.toFixed(2)}%
      </text>
    </svg>
  );
}

// ── Horizontal Bar Chart ─────────────────────────────────────────────────────
function ExpenseBarChart({ categories }: { categories: typeof EXPENSE_CATEGORIES }) {
  const maxAmount = Math.max(...categories.map((c) => c.amount));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {categories.map((cat) => (
        <div key={cat.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 100, fontSize: 12, textAlign: 'right', color: '#374151', flexShrink: 0 }}>
            {cat.name}
          </span>
          <div style={{ flex: 1, height: 18, backgroundColor: '#f3f4f6', borderRadius: 2, position: 'relative' }}>
            <div
              style={{
                height: '100%',
                width: `${(cat.amount / maxAmount) * 100}%`,
                backgroundColor: cat.color,
                borderRadius: 2,
                transition: 'width 0.5s ease',
              }}
            />
          </div>
          <span style={{ width: 80, fontSize: 12, color: '#374151', flexShrink: 0 }}>
            ${fmt(cat.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main Dashboard Component ─────────────────────────────────────────────────
export default function KnowifyDashboard() {
  const [activeNav, setActiveNav] = useState('Financials');

  const actualMargin = FINANCIALS.actualRevenue - FINANCIALS.actualExpense;
  const marginPercent = (actualMargin / FINANCIALS.actualRevenue) * 100;

  return (
    <div style={{ fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif", backgroundColor: '#f0f4ff', minHeight: '100vh', color: '#1f2937' }}>
      {/* ── Header Banner ─────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', padding: '32px 0 24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 42, fontWeight: 800, color: '#fff', margin: 0, fontStyle: 'italic' }}>
          Financials Dashboard
        </h1>
        <p style={{ color: '#cbd5e1', fontSize: 16, marginTop: 4 }}>
          Track profit and progress with easy-to-read charts
        </p>
      </div>

      {/* ── Project Header ────────────────────────────────────────── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', backgroundColor: '#fff',
          border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px 24px',
          marginTop: -16, position: 'relative', zIndex: 1, gap: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}>
          {/* Project icon */}
          <div style={{
            width: 72, height: 72, borderRadius: 8,
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 14,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24 }}>&#128204;</div>
              <div style={{ fontSize: 10 }}>Project</div>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
              PROJECT
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
              {PROJECT.name}
              <span style={{ cursor: 'pointer', color: '#6b7280', fontSize: 14 }}>&#9998;</span>
            </div>
            <div style={{ display: 'flex', gap: 24, marginTop: 4, fontSize: 13 }}>
              <div>
                <span style={{ color: '#6b7280', textTransform: 'uppercase', fontSize: 10, fontWeight: 600, letterSpacing: 0.5 }}>STATUS</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#f59e0b', display: 'inline-block' }} />
                  <span style={{ color: '#374151' }}>{PROJECT.status}</span>
                </div>
              </div>
              <div>
                <span style={{ color: '#6b7280', textTransform: 'uppercase', fontSize: 10, fontWeight: 600, letterSpacing: 0.5 }}>SERVICE ADDRESS</span>
                <div style={{ color: '#374151' }}>{PROJECT.address}</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{
              width: 36, height: 36, borderRadius: 6, border: '1px solid #d1d5db',
              background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, color: '#374151',
            }}>&#9998;</button>
            <button style={{
              padding: '8px 16px', borderRadius: 6, border: '1px solid #2563eb',
              background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 600,
              fontSize: 13, display: 'flex', alignItems: 'center', gap: 4,
            }}>
              Actions <span style={{ fontSize: 10 }}>&#9650;</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Content Area ─────────────────────────────────────── */}
      <div style={{ maxWidth: 1200, margin: '24px auto 0', padding: '0 24px', display: 'flex', gap: 24 }}>
        {/* ── Left Sidebar Nav ──────────────────────────────────── */}
        <nav style={{ width: 180, flexShrink: 0 }}>
          {NAV_ITEMS.map((item) => (
            <div
              key={item.label}
              onClick={() => setActiveNav(item.label)}
              style={{
                padding: '10px 12px', cursor: 'pointer', borderRadius: 6,
                backgroundColor: activeNav === item.label ? '#eff6ff' : 'transparent',
                marginBottom: 2, transition: 'background-color 0.15s',
              }}
            >
              <div style={{
                fontSize: 14, fontWeight: activeNav === item.label ? 700 : 500,
                color: activeNav === item.label ? '#2563eb' : '#374151',
              }}>
                {item.label}
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{item.sub}</div>
            </div>
          ))}
        </nav>

        {/* ── Right Content ─────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Section Title */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#111827' }}>Financials</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 12, color: '#6b7280', cursor: 'pointer' }}>&#9660;</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Project Summary</span>
              </div>
            </div>
            <button style={{
              padding: '8px 20px', borderRadius: 6, border: '1px solid #2563eb',
              background: '#fff', color: '#2563eb', cursor: 'pointer', fontWeight: 600, fontSize: 13,
            }}>
              Project Costing
            </button>
          </div>

          {/* ── Summary Cards ───────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
            {/* Contract Value */}
            <div style={{
              backgroundColor: '#fff', borderRadius: 8, padding: '20px 24px',
              border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}>
              <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>
                CONTRACT VALUE
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginTop: 4 }}>
                ${fmt(FINANCIALS.contractValue)}
              </div>
              <div style={{ borderTop: '1px solid #f3f4f6', marginTop: 12, paddingTop: 12 }}>
                <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>ACTUAL REVENUE</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginTop: 2 }}>${fmt(FINANCIALS.actualRevenue)}</div>
              </div>
            </div>

            {/* Total Budgeted Expenses */}
            <div style={{
              backgroundColor: '#fff', borderRadius: 8, padding: '20px 24px',
              border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}>
              <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>
                TOTAL BUDGETED EXPENSES
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginTop: 4 }}>
                ${fmt(FINANCIALS.totalBudgetedExpenses)}
              </div>
              <div style={{ borderTop: '1px solid #f3f4f6', marginTop: 12, paddingTop: 12 }}>
                <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>COST TO COMPLETE</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginTop: 2 }}>+${fmt(FINANCIALS.costToComplete)}</div>
              </div>
            </div>

            {/* Actual Expense */}
            <div style={{
              backgroundColor: '#fff', borderRadius: 8, padding: '20px 24px',
              border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}>
              <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>
                ACTUAL EXPENSE
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginTop: 4 }}>
                ${fmt(FINANCIALS.actualExpense)}
              </div>
              <div style={{ marginTop: 16 }}>
                <ExpenseBarChart categories={EXPENSE_CATEGORIES} />
              </div>
            </div>
          </div>

          {/* ── Margin Section ──────────────────────────────────── */}
          <div style={{
            backgroundColor: '#fff', borderRadius: 8, padding: '24px',
            border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
              {/* Left: Margin numbers + donut */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>
                      ACTUAL MARGIN
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginTop: 4 }}>
                      ${fmt(actualMargin)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>
                      BUDGETED MARGIN
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginTop: 6 }}>
                      ${fmt(FINANCIALS.budgetedMarginDollars)} ({FINANCIALS.budgetedMarginPercent}%)
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 8 }}>
                  <DonutChart percent={marginPercent} />
                </div>
              </div>

              {/* Right: Summary Table */}
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <tbody>
                    {[
                      { label: 'Actual Revenue to date', value: `$${fmt(FINANCIALS.actualRevenue)}`, dot: null },
                      { label: 'Actual Expense to date', value: `$${fmt(FINANCIALS.actualExpense)}`, dot: '#2596be' },
                      { label: 'Actual Margin $ to date', value: `$${fmt(actualMargin)}`, dot: '#7c5bbf' },
                      { label: 'Actual Margin % to date', value: `${marginPercent.toFixed(2)}%`, dot: null },
                    ].map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '10px 8px', color: '#374151', display: 'flex', alignItems: 'center', gap: 8 }}>
                          {row.dot && (
                            <span style={{
                              width: 10, height: 10, borderRadius: '50%',
                              backgroundColor: row.dot, display: 'inline-block', flexShrink: 0,
                            }} />
                          )}
                          {row.label}
                        </td>
                        <td style={{ padding: '10px 8px', fontWeight: 600, color: '#111827', textAlign: 'right' }}>
                          {row.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer spacing */}
      <div style={{ height: 48 }} />
    </div>
  );
}
