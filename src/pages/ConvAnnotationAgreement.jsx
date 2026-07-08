import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getEligibleAgreementConversations,
  getAgreementReports,
  getAgreementReport,
  computeAgreementReport,
} from '../services/convAnnotationService';

// ─── Constants ───────────────────────────────────────────────────────────────

const PCK_SKILLS = [
  { id: 'p1', label: 'זיהוי השגיאה' },
  { id: 'p2', label: 'אפיון השגיאה' },
  { id: 'p3', label: 'פרשנות' },
  { id: 'p4', label: 'תגובה פדגוגית' },
  { id: 'p5', label: 'מינוף' },
];

const DISAGREE_TYPES = [
  { id: 'all',       label: 'הכל' },
  { id: 'location',  label: 'מיקום משוב' },
  { id: 'dimension', label: 'ממד PCK' },
  { id: 'score',     label: 'ציון' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function kappaLabel(k) {
  if (k == null || isNaN(k)) return null;
  if (k < 0)    return { text: 'גרוע',  cls: 'danger' };
  if (k < 0.2)  return { text: 'חלש',   cls: 'danger' };
  if (k < 0.41) return { text: 'סביר',  cls: 'warning' };
  if (k < 0.61) return { text: 'מתון',  cls: 'info' };
  if (k < 0.81) return { text: 'טוב',   cls: 'success' };
  return              { text: 'מצוין', cls: 'success' };
}

function fmt(n, digits) {
  if (n == null || isNaN(n)) return '—';
  return typeof digits === 'number' ? n.toFixed(digits) : n;
}

function pct(n) {
  if (n == null) return '—';
  return `${Math.round(n * 100)}%`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return iso; }
}

// ─── Small reusable UI pieces ─────────────────────────────────────────────────

function KappaCell({ k }) {
  if (k == null || isNaN(k)) return <span className="text-muted">—</span>;
  const lbl = kappaLabel(k);
  return (
    <span>
      {fmt(k, 2)}{' '}
      <span className={`badge badge-${lbl.cls} ms-1`} style={{ fontSize: '0.7em' }}>{lbl.text}</span>
    </span>
  );
}

function SummaryCard({ title, value, sub, color }) {
  return (
    <div className="card text-center mb-3" style={{ borderTop: `4px solid ${color || '#6c5ce7'}`, minWidth: 140 }}>
      <div className="card-body py-2 px-3">
        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: color || '#6c5ce7' }}>{value}</div>
        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{title}</div>
        {sub && <div style={{ fontSize: '0.75rem', color: '#777' }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Confusion matrix display ─────────────────────────────────────────────────

function ConfusionMatrix({ matrix, nameA, nameB }) {
  if (!matrix) return null;
  // matrix may be stored as a flat 9-element array (row-major) or a 2D array
  const get = (i, j) => Array.isArray(matrix[0])
    ? matrix[i][j]
    : (matrix[i * 3 + j] || 0);
  return (
    <table className="table table-sm table-bordered text-center" style={{ fontSize: '0.82rem', maxWidth: 200 }}>
      <thead>
        <tr>
          <th style={{ background: '#f5f0ff' }}>A \ B</th>
          <th>0</th><th>1</th><th>2</th>
        </tr>
      </thead>
      <tbody>
        {[0, 1, 2].map(i => (
          <tr key={i}>
            <th style={{ background: '#f5f0ff' }}>{i}</th>
            {[0, 1, 2].map(j => (
              <td key={j} style={{ background: i === j ? '#e8ffe8' : get(i, j) > 0 ? '#fff3cd' : '' }}>
                {get(i, j)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      <caption style={{ captionSide: 'bottom', fontSize: '0.72rem', color: '#666' }}>
        שורות: {nameA} | עמודות: {nameB}
      </caption>
    </table>
  );
}

// ─── Report detail sections ────────────────────────────────────────────────────

function LocationSection({ loc, nameA, nameB }) {
  if (!loc) return null;
  return (
    <div className="mb-4">
      <h6 className="font-weight-bold mb-3" style={{ color: '#6c5ce7' }}>הסכמה על מיקום נקודות משוב</h6>
      <div className="row">
        <div className="col-md-6">
          <table className="table table-sm">
            <tbody>
              <tr><td>סה"כ תורות מורה שנבדקו</td><td><strong>{loc.totalTurns}</strong></td></tr>
              <tr><td>סומנו על ידי שני המעריכים</td><td className="text-success"><strong>{loc.bothMarked}</strong></td></tr>
              <tr><td>לא סומנו על ידי אף אחד</td><td><strong>{loc.neitherMarked}</strong></td></tr>
              <tr><td>סומן רק על ידי {nameA}</td><td className="text-danger"><strong>{loc.onlyA}</strong></td></tr>
              <tr><td>סומן רק על ידי {nameB}</td><td className="text-danger"><strong>{loc.onlyB}</strong></td></tr>
            </tbody>
          </table>
        </div>
        <div className="col-md-6">
          <div className="card bg-light p-3">
            <div className="mb-2">
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>אחוז הסכמה</span>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#6c5ce7' }}>{pct(loc.percentAgreement)}</div>
            </div>
            <div>
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>Cohen's kappa</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 600 }}><KappaCell k={loc.cohensKappa} /></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DimensionSection({ dimAgreement, nameA, nameB }) {
  if (!dimAgreement) return null;
  return (
    <div className="mb-4">
      <h6 className="font-weight-bold mb-3" style={{ color: '#6c5ce7' }}>הסכמה על ממדי PCK הרלוונטיים</h6>
      <p style={{ fontSize: '0.85rem', color: '#666' }}>
        מחושב לכל תור מורה שלפחות אחד המעריכים סימן בו נקודת משוב.
      </p>
      <div className="table-responsive">
        <table className="table table-sm table-hover">
          <thead style={{ background: '#f5f0ff' }}>
            <tr>
              <th>ממד PCK</th>
              <th>תורות שנבדקו</th>
              <th>שניהם סימנו</th>
              <th>אף אחד לא סימן</th>
              <th>רק {nameA}</th>
              <th>רק {nameB}</th>
              <th>% הסכמה</th>
              <th>kappa</th>
            </tr>
          </thead>
          <tbody>
            {PCK_SKILLS.map(({ id, label }) => {
              const d = dimAgreement[id];
              if (!d) return null;
              return (
                <tr key={id}>
                  <td><strong>{label}</strong></td>
                  <td>{d.turnsAnalyzed}</td>
                  <td className="text-success">{d.bothSelected}</td>
                  <td>{d.neitherSelected}</td>
                  <td className="text-danger">{d.onlyA}</td>
                  <td className="text-danger">{d.onlyB}</td>
                  <td>{pct(d.percentAgreement)}</td>
                  <td><KappaCell k={d.cohensKappa} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScoreSection({ scoreAgreement, nameA, nameB }) {
  const [expandedDim, setExpandedDim] = useState(null);
  if (!scoreAgreement) return null;
  const hasCases = PCK_SKILLS.some(({ id }) => scoreAgreement[id] && scoreAgreement[id].comparableCases > 0);
  if (!hasCases) {
    return (
      <div className="mb-4">
        <h6 className="font-weight-bold mb-2" style={{ color: '#6c5ce7' }}>הסכמה על ציונים (0/1/2)</h6>
        <div className="alert alert-info" style={{ fontSize: '0.9rem' }}>
          לא נמצאו מקרים שבהם שני המעריכים סימנו את אותו ממד PCK על אותו תור מורה.
        </div>
      </div>
    );
  }
  return (
    <div className="mb-4">
      <h6 className="font-weight-bold mb-3" style={{ color: '#6c5ce7' }}>הסכמה על ציונים (0/1/2)</h6>
      <p style={{ fontSize: '0.85rem', color: '#666' }}>
        מחושב רק עבור תורות שבהם שני המעריכים סימנו את אותו ממד PCK.
      </p>
      <div className="table-responsive">
        <table className="table table-sm table-hover">
          <thead style={{ background: '#f5f0ff' }}>
            <tr>
              <th>ממד PCK</th>
              <th>מקרים להשוואה</th>
              <th>התאמה מדויקת</th>
              <th>% התאמה</th>
              <th
                title="MAE = ממוצע הפער המוחלט בין ציוני שני המעריכים. ככל שהערך נמוך יותר, ההסכמה גבוהה יותר."
                style={{ cursor: 'help', borderBottom: '1px dashed #999' }}
              >
                פער ממוצע בציון (MAE)
              </th>
              <th>weighted kappa</th>
              <th>מטריצת בלבול</th>
            </tr>
          </thead>
          <tbody>
            {PCK_SKILLS.map(({ id, label }) => {
              const s = scoreAgreement[id];
              if (!s) return null;
              const isExpanded = expandedDim === id;
              return (
                <React.Fragment key={id}>
                  <tr>
                    <td><strong>{label}</strong></td>
                    <td>{s.comparableCases}</td>
                    <td>{s.comparableCases > 0 ? s.exactAgreement : '—'}</td>
                    <td>{s.comparableCases > 0 ? pct(s.exactAgreementPercent) : '—'}</td>
                    <td>{s.comparableCases > 0 ? fmt(s.meanAbsoluteDiff, 2) : '—'}</td>
                    <td>{s.comparableCases > 0 ? <KappaCell k={s.weightedKappa} /> : '—'}</td>
                    <td>
                      {s.comparableCases > 0 && (
                        <button
                          className="btn btn-sm btn-outline-secondary py-0 px-2"
                          style={{ fontSize: '0.75rem' }}
                          onClick={() => setExpandedDim(isExpanded ? null : id)}
                        >
                          {isExpanded ? 'הסתר' : 'הצג'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={7} style={{ background: '#fafafa', padding: '16px' }}>
                        <ConfusionMatrix matrix={s.confusionMatrix} nameA={nameA} nameB={nameB} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DisagreementsSection({ disagreements, scenarioTitleMap }) {
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const typeLabel = { location: 'מיקום משוב', dimension: 'ממד PCK', score: 'ציון' };
  const typeBadge = { location: 'warning', dimension: 'info', score: 'danger' };

  const filtered = useMemo(() => {
    if (!disagreements) return [];
    return typeFilter === 'all' ? disagreements : disagreements.filter(d => d.type === typeFilter);
  }, [disagreements, typeFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleTypeFilter = (t) => { setTypeFilter(t); setPage(1); };

  if (!disagreements || disagreements.length === 0) {
    return (
      <div className="mb-4">
        <h6 className="font-weight-bold mb-2" style={{ color: '#6c5ce7' }}>פירוט חוסר הסכמות</h6>
        <div className="alert alert-success" style={{ fontSize: '0.9rem' }}>
          לא נמצאו חוסר הסכמות!
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <h6 className="font-weight-bold mb-3" style={{ color: '#6c5ce7' }}>
        פירוט חוסר הסכמות
        <span className="badge badge-secondary ml-2" style={{ fontSize: '0.8rem' }}>{filtered.length}</span>
      </h6>

      <div className="mb-3 d-flex flex-wrap gap-2" style={{ gap: '8px' }}>
        {DISAGREE_TYPES.map(t => (
          <button
            key={t.id}
            className={`btn btn-sm ${typeFilter === t.id ? 'btn-primary' : 'btn-outline-secondary'}`}
            style={typeFilter === t.id ? { background: '#6c5ce7', borderColor: '#6c5ce7' } : {}}
            onClick={() => handleTypeFilter(t.id)}
          >
            {t.label}
            {t.id !== 'all' && (
              <span className="badge badge-light ml-1" style={{ fontSize: '0.7em' }}>
                {(disagreements || []).filter(d => d.type === t.id).length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="table-responsive">
        <table className="table table-sm table-hover" style={{ fontSize: '0.85rem' }}>
          <thead style={{ background: '#f5f0ff' }}>
            <tr>
              <th>שיחה / תרחיש</th>
              <th>תור</th>
              <th>סוג חוסר הסכמה</th>
              <th>פירוט</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((d, idx) => (
              <tr key={idx}>
                <td style={{ maxWidth: 240 }}>
                  {d.convLabel ? (
                    d.convLabel.split('\n').map((line, i) => (
                      <div
                        key={i}
                        style={{
                          fontSize:   i === 0 ? '0.85rem' : '0.75rem',
                          color:      i === 0 ? '#333'    : '#888',
                          fontWeight: i === 0 ? 500       : 400,
                          marginTop:  i === 0 ? 0 : 2,
                          lineHeight: 1.3,
                        }}
                      >
                        {line}
                      </div>
                    ))
                  ) : (
                    <span title={d.scenarioTitle} style={{ fontSize: '0.85rem' }}>
                      {d.scenarioTitle || d.conversationId}
                    </span>
                  )}
                </td>
                <td>{d.turnNumber}</td>
                <td>
                  <span className={`badge badge-${typeBadge[d.type] || 'secondary'}`} style={{ color: '#fff' }}>
                    {typeLabel[d.type] || d.type}
                  </span>
                </td>
                <td style={{ direction: 'rtl' }}>{d.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="d-flex align-items-center justify-content-between mt-2">
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            הקודם
          </button>
          <span style={{ fontSize: '0.85rem' }}>עמוד {page} מתוך {totalPages}</span>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            הבא
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Full report detail view ──────────────────────────────────────────────────

function ReportDetail({ report, onBack }) {
  const m = report.metrics || {};
  const loc = m.locationAgreement || {};
  const summary = m.summary || {};
  const annotatorNames = report.annotatorNames || {};
  const [uidA, uidB] = report.annotatorIds || [];
  const nameA = annotatorNames[uidA] || uidA || '—';
  const nameB = annotatorNames[uidB] || uidB || '—';

  return (
    <div>
      {/* Back + header */}
      <div className="d-flex align-items-center mb-3 flex-wrap" style={{ gap: '12px' }}>
        <button className="btn btn-sm btn-outline-secondary" onClick={onBack}>
          ← חזרה לרשימה
        </button>
        <h5 className="mb-0" style={{ color: '#6c5ce7' }}>{report.reportName || 'דוח הסכמה'}</h5>
      </div>

      <div className="text-muted mb-3" style={{ fontSize: '0.85rem', direction: 'rtl' }}>
        <span>נוצר: {fmtDate(report.createdAt)}</span>
        <span className="mx-2">|</span>
        <span>מעריכים: <strong>{nameA}</strong> ו-<strong>{nameB}</strong></span>
        <span className="mx-2">|</span>
        <span>{(report.conversationIds || []).length} שיחות</span>
      </div>

      {/* Summary cards */}
      <div className="d-flex flex-wrap mb-4" style={{ gap: '12px' }}>
        <SummaryCard title="שיחות שנכללו"   value={m.totalConversations || 0} color="#6c5ce7" />
        <SummaryCard title="תורות מורה שנבדקו" value={m.totalTeacherTurns || 0} color="#6c5ce7" />
        <SummaryCard title="% הסכמה – מיקום" value={pct(loc.percentAgreement)} color="#00b894" />
        <SummaryCard title="kappa – מיקום"   value={fmt(loc.cohensKappa, 2)}
          sub={loc.cohensKappa != null ? kappaLabel(loc.cohensKappa).text : ''}
          color="#00b894" />
        <SummaryCard title="ממוצע kappa ממדים" value={fmt(summary.avgDimensionKappa, 2)}
          sub={summary.avgDimensionKappa != null ? kappaLabel(summary.avgDimensionKappa).text : ''}
          color="#fdcb6e" />
        <SummaryCard title="ממוצע weighted kappa ציונים" value={fmt(summary.avgWeightedKappa, 2)}
          sub={summary.avgWeightedKappa != null ? kappaLabel(summary.avgWeightedKappa).text : ''}
          color="#e17055" />
      </div>

      {summary.mostDisagreedDimension && (
        <div className="alert alert-warning mb-4" style={{ fontSize: '0.9rem' }}>
          <strong>ממד עם הכי הרבה חוסר הסכמות:</strong> {summary.mostDisagreedDimension}
        </div>
      )}

      <LocationSection  loc={m.locationAgreement}  nameA={nameA} nameB={nameB} />
      <DimensionSection dimAgreement={m.dimensionAgreement}  nameA={nameA} nameB={nameB} />
      <ScoreSection     scoreAgreement={m.scoreAgreement}    nameA={nameA} nameB={nameB} />
      <DisagreementsSection disagreements={report.disagreements} />
    </div>
  );
}

// ─── Reports list view ────────────────────────────────────────────────────────

function ReportListView({ reports, loading, onView, onCreateNew }) {
  if (loading) {
    return <div className="text-center py-5"><div className="spinner-border text-primary" /></div>;
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="mb-0" style={{ color: '#333' }}>דוחות שמורים</h6>
        <button
          className="btn btn-sm text-white"
          style={{ background: '#6c5ce7', borderColor: '#6c5ce7' }}
          onClick={onCreateNew}
        >
          + דוח חדש
        </button>
      </div>

      {reports.length === 0 ? (
        <div className="alert alert-info" style={{ fontSize: '0.9rem' }}>
          לא נמצאו דוחות שמורים. לחץ "+ דוח חדש" כדי לחשב הסכמה לראשונה.
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm table-hover">
            <thead style={{ background: '#f5f0ff' }}>
              <tr>
                <th>שם הדוח</th>
                <th>תאריך</th>
                <th>שיחות</th>
                <th>מעריכים</th>
                <th>kappa מיקום</th>
                <th>kappa ממדים (ממוצע)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => {
                const annotatorNames = r.annotatorNames || {};
                const names = (r.annotatorIds || []).map(id => annotatorNames[id] || id).join(', ');
                return (
                  <tr key={r.id}>
                    <td><strong>{r.reportName}</strong></td>
                    <td>{fmtDate(r.createdAt)}</td>
                    <td>{(r.conversationIds || []).length}</td>
                    <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={names}>{names}</td>
                    <td><KappaCell k={r.summaryLocationKappa} /></td>
                    <td><KappaCell k={r.summaryAvgDimKappa} /></td>
                    <td>
                      <button
                        className="btn btn-sm btn-outline-primary"
                        style={{ color: '#6c5ce7', borderColor: '#6c5ce7', fontSize: '0.8rem' }}
                        onClick={() => onView(r.id)}
                      >
                        צפה בדוח
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Create report view ───────────────────────────────────────────────────────

function CreateReportView({ adminId, onBack, onReportCreated }) {
  const [loadingEligible, setLoadingEligible] = useState(true);
  const [eligibleConvs, setEligibleConvs]     = useState([]);
  const [eligibleError, setEligibleError]     = useState(null);

  const [selectedConvIds, setSelectedConvIds] = useState(new Set());
  const [selectedAnnotators, setSelectedAnnotators] = useState([]); // max 2 UIDs
  const [reportName, setReportName]           = useState('');
  const [computing, setComputing]             = useState(false);
  const [computeError, setComputeError]       = useState(null);

  useEffect(() => {
    setLoadingEligible(true);
    getEligibleAgreementConversations(adminId)
      .then(convs => setEligibleConvs(convs))
      .catch(e => setEligibleError(e.message))
      .finally(() => setLoadingEligible(false));
  }, [adminId]);

  // All unique annotators from selected conversations
  const availableAnnotators = useMemo(() => {
    const map = {};
    eligibleConvs
      .filter(c => selectedConvIds.has(c.conversationId))
      .forEach(c => {
        (c.completedBy || []).forEach(a => {
          if (!map[a.annotatorId]) map[a.annotatorId] = a.annotatorName;
        });
      });
    return Object.entries(map).map(([id, name]) => ({ id, name }));
  }, [eligibleConvs, selectedConvIds]);

  // Conversations covered by BOTH selected annotators
  const coveredConvIds = useMemo(() => {
    if (selectedAnnotators.length < 2) return [];
    const [aidA, aidB] = selectedAnnotators;
    return [...selectedConvIds].filter(convId => {
      const conv = eligibleConvs.find(c => c.conversationId === convId);
      if (!conv) return false;
      const ids = (conv.completedBy || []).map(a => a.annotatorId);
      return ids.includes(aidA) && ids.includes(aidB);
    });
  }, [eligibleConvs, selectedConvIds, selectedAnnotators]);

  // Assignment IDs to include
  const includedAssignmentIds = useMemo(() => {
    if (selectedAnnotators.length < 2) return [];
    const [aidA, aidB] = selectedAnnotators;
    const ids = [];
    coveredConvIds.forEach(convId => {
      const conv = eligibleConvs.find(c => c.conversationId === convId);
      if (!conv) return;
      (conv.completedBy || []).forEach(a => {
        if (a.annotatorId === aidA || a.annotatorId === aidB) ids.push(a.assignmentId);
      });
    });
    return ids;
  }, [eligibleConvs, coveredConvIds, selectedAnnotators]);

  const canCompute = coveredConvIds.length > 0 && selectedAnnotators.length === 2;

  function toggleConv(convId) {
    setSelectedConvIds(prev => {
      const next = new Set(prev);
      if (next.has(convId)) next.delete(convId); else next.add(convId);
      return next;
    });
    // Reset annotator selection when conversations change
    setSelectedAnnotators([]);
  }

  function selectAll() {
    setSelectedConvIds(new Set(eligibleConvs.map(c => c.conversationId)));
    setSelectedAnnotators([]);
  }

  function clearAll() {
    setSelectedConvIds(new Set());
    setSelectedAnnotators([]);
  }

  function toggleAnnotator(uid) {
    setSelectedAnnotators(prev => {
      if (prev.includes(uid)) return prev.filter(id => id !== uid);
      if (prev.length >= 2) return prev; // max 2
      return [...prev, uid];
    });
  }

  async function handleCompute() {
    if (!canCompute) return;
    setComputing(true);
    setComputeError(null);
    try {
      const report = await computeAgreementReport(adminId, {
        reportName: reportName.trim() || null,
        conversationIds: coveredConvIds,
        annotatorIds: selectedAnnotators,
        includedAssignmentIds,
      });
      onReportCreated(report);
    } catch (e) {
      setComputeError(e.message);
    } finally {
      setComputing(false);
    }
  }

  if (loadingEligible) {
    return <div className="text-center py-5"><div className="spinner-border text-primary" /></div>;
  }

  return (
    <div>
      <div className="d-flex align-items-center mb-3" style={{ gap: '12px' }}>
        <button className="btn btn-sm btn-outline-secondary" onClick={onBack}>
          ← חזרה לרשימה
        </button>
        <h6 className="mb-0" style={{ color: '#6c5ce7' }}>יצירת דוח הסכמה חדש</h6>
      </div>

      {eligibleError && (
        <div className="alert alert-danger">{eligibleError}</div>
      )}

      {/* Report name */}
      <div className="form-group mb-4">
        <label style={{ fontWeight: 600 }}>שם הדוח (אופציונלי)</label>
        <input
          className="form-control"
          placeholder='לדוגמה: "ניתוח הסכמה – יולי 2026"'
          value={reportName}
          onChange={e => setReportName(e.target.value)}
          style={{ maxWidth: 420 }}
        />
      </div>

      {/* Eligible conversations */}
      <div className="mb-4">
        <div className="d-flex align-items-center mb-2" style={{ gap: '10px' }}>
          <label style={{ fontWeight: 600, marginBottom: 0 }}>
            בחר שיחות לניתוח
            <span className="badge badge-secondary ml-2" style={{ fontSize: '0.8rem' }}>
              {eligibleConvs.length} זמינות
            </span>
          </label>
          {eligibleConvs.length > 0 && (
            <>
              <button className="btn btn-sm btn-link p-0" onClick={selectAll}>בחר הכל</button>
              <button className="btn btn-sm btn-link p-0 text-muted" onClick={clearAll}>נקה</button>
            </>
          )}
        </div>

        {eligibleConvs.length === 0 ? (
          <div className="alert alert-warning" style={{ fontSize: '0.9rem' }}>
            לא נמצאו שיחות עם שתי הערכות "בדיקת הסכמה" מושלמות. וודא שיש לפחות שני מעריכים שסיימו לתייג את אותה שיחה.
          </div>
        ) : (
          <div className="table-responsive" style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #dee2e6', borderRadius: 4 }}>
            <table className="table table-sm table-hover mb-0">
              <thead style={{ background: '#f5f0ff', position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>שיחה / תרחיש</th>
                  <th>מעריכים שסיימו</th>
                </tr>
              </thead>
              <tbody>
                {eligibleConvs.map(conv => {
                  const title = (conv.convMeta && conv.convMeta.scenario && conv.convMeta.scenario.text)
                    ? conv.convMeta.scenario.text.slice(0, 70)
                    : conv.conversationId.slice(0, 14);
                  const annotatorList = (conv.completedBy || []).map(a => a.annotatorName).join(', ');
                  return (
                    <tr
                      key={conv.conversationId}
                      style={{ cursor: 'pointer', background: selectedConvIds.has(conv.conversationId) ? '#f0edff' : '' }}
                      onClick={() => toggleConv(conv.conversationId)}
                    >
                      <td onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedConvIds.has(conv.conversationId)}
                          onChange={() => toggleConv(conv.conversationId)}
                        />
                      </td>
                      <td>{title}</td>
                      <td style={{ fontSize: '0.82rem', color: '#555' }}>{annotatorList}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Annotator pair selection */}
      {selectedConvIds.size > 0 && (
        <div className="mb-4">
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
            בחר שני מעריכים להשוואה
          </label>
          {availableAnnotators.length < 2 ? (
            <div className="alert alert-info" style={{ fontSize: '0.9rem' }}>
              יש לבחור לפחות שיחה אחת שבה שני מעריכים שונים סיימו לתייג.
            </div>
          ) : (
            <>
              <p style={{ fontSize: '0.82rem', color: '#666', marginBottom: 8 }}>
                ניתן לבחור בדיוק שני מעריכים לניתוח זוגי.
              </p>
              <div className="d-flex flex-wrap" style={{ gap: '10px' }}>
                {availableAnnotators.map(a => {
                  const isSelected = selectedAnnotators.includes(a.id);
                  const isDisabled = !isSelected && selectedAnnotators.length >= 2;
                  return (
                    <div
                      key={a.id}
                      onClick={() => !isDisabled && toggleAnnotator(a.id)}
                      style={{
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        padding: '6px 14px',
                        borderRadius: 20,
                        border: `2px solid ${isSelected ? '#6c5ce7' : '#ccc'}`,
                        background: isSelected ? '#f0edff' : '#fff',
                        fontWeight: isSelected ? 600 : 400,
                        color: isDisabled ? '#bbb' : '#333',
                        fontSize: '0.9rem',
                        userSelect: 'none',
                      }}
                    >
                      {isSelected && <span className="text-primary mr-1">✓</span>}
                      {a.name}
                    </div>
                  );
                })}
              </div>
              {selectedAnnotators.length === 2 && (
                <div className="mt-2" style={{ fontSize: '0.85rem', color: '#555' }}>
                  {coveredConvIds.length === 0 ? (
                    <span className="text-danger">
                      שני המעריכים שנבחרו לא השלימו תיוג של אותן שיחות.
                    </span>
                  ) : (
                    <span className="text-success">
                      הניתוח יבוצע על <strong>{coveredConvIds.length}</strong> שיחות שבהן שני המעריכים השלימו תיוג.
                      {coveredConvIds.length < selectedConvIds.size && (
                        <span className="text-muted ml-1">
                          ({selectedConvIds.size - coveredConvIds.length} שיחות ייצאו מהניתוח כי לא שניהם השלימו.)
                        </span>
                      )}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {computeError && (
        <div className="alert alert-danger mb-3">{computeError}</div>
      )}

      <button
        className="btn text-white"
        style={{ background: '#6c5ce7', borderColor: '#6c5ce7' }}
        disabled={!canCompute || computing}
        onClick={handleCompute}
      >
        {computing ? (
          <><span className="spinner-border spinner-border-sm mr-2" />מחשב הסכמה...</>
        ) : (
          'חשב הסכמה'
        )}
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ConvAnnotationAgreement() {
  const { currentUser } = useAuth();
  const adminId = currentUser && currentUser.uid;

  const [view, setView]               = useState('list'); // 'list' | 'create' | 'detail'
  const [reports, setReports]         = useState([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError]     = useState(null);
  const [detailReport, setDetailReport]     = useState(null);
  const [detailLoading, setDetailLoading]   = useState(false);
  const [detailError, setDetailError]       = useState(null);

  const loadReports = useCallback(() => {
    if (!adminId) return;
    setReportsLoading(true);
    setReportsError(null);
    getAgreementReports(adminId)
      .then(r => setReports(r))
      .catch(e => setReportsError(e.message))
      .finally(() => setReportsLoading(false));
  }, [adminId]);

  useEffect(() => { loadReports(); }, [loadReports]);

  async function handleView(reportId) {
    setDetailLoading(true);
    setDetailError(null);
    setView('detail');
    try {
      const report = await getAgreementReport(reportId, adminId);
      setDetailReport(report);
    } catch (e) {
      setDetailError(e.message);
    } finally {
      setDetailLoading(false);
    }
  }

  function handleReportCreated(report) {
    setDetailReport(report);
    setView('detail');
    loadReports(); // refresh list in background
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (view === 'create') {
    return (
      <CreateReportView
        adminId={adminId}
        onBack={() => setView('list')}
        onReportCreated={handleReportCreated}
      />
    );
  }

  if (view === 'detail') {
    if (detailLoading) {
      return <div className="text-center py-5"><div className="spinner-border text-primary" /></div>;
    }
    if (detailError) {
      return (
        <div>
          <div className="alert alert-danger">{detailError}</div>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setView('list')}>← חזרה</button>
        </div>
      );
    }
    if (detailReport) {
      return <ReportDetail report={detailReport} onBack={() => setView('list')} />;
    }
  }

  return (
    <div>
      {reportsError && <div className="alert alert-danger mb-3">{reportsError}</div>}
      <ReportListView
        reports={reports}
        loading={reportsLoading}
        onView={handleView}
        onCreateNew={() => setView('create')}
      />
    </div>
  );
}
