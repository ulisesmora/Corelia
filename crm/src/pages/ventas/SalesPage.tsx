// Ventas: lo cobrado en el periodo frente al anterior, quién debe, bonos y
// cuotas, recibos y el «Cierre para la gestoría» (CSV del periodo).
// Datos: GET /api/v1/dashboard/sales/?period=… (api/utils/dashboard.py).
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, Skeleton, Typography,
} from '@mui/material';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import CreditCardOutlinedIcon from '@mui/icons-material/CreditCardOutlined';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import SentimentSatisfiedAltRoundedIcon from '@mui/icons-material/SentimentSatisfiedAltRounded';
import { useNotify } from '../../components/guide';
import { dashApi, type CollectedRow, type Kpi, type OwedRow, type Period, type SalesData } from '../kit/api';
import { fmtMoney, shortDate } from '../kit/format';
import { Avatar, Card, CardHead, EmptyBox, IBadge, PageHead, Seg, Tag, TonalButton } from '../kit/ui';
import { rowSx } from '../kit/styles';
import { KpiCard } from '../hoy/KpiRow';
import SalesChart from './SalesChart';

type TabKey = 'owed' | 'collected' | 'plans' | 'receipts';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: 'Semana' }, { value: 'month', label: 'Mes' }, { value: 'quarter', label: 'Trimestre' }, { value: 'year', label: 'Año' },
];
const LS_PERIOD = 'ventas.period';

function readPeriod(): Period {
  try {
    const v = localStorage.getItem(LS_PERIOD) as Period | null;
    return v && PERIODS.some((p) => p.value === v) ? v : 'month';
  } catch { return 'month'; }
}

function kpisOf(d: SalesData): Kpi[] {
  const k = d.kpis;
  const trend = (v: number) => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat') as 'up' | 'down' | 'flat';
  const owedHint = k.pending_count
    ? [k.pending_failed && `${k.pending_failed} ${k.pending_failed === 1 ? 'pago fallido' : 'pagos fallidos'}`,
      k.pending_count - k.pending_failed && `${k.pending_count - k.pending_failed} ${k.pending_count - k.pending_failed === 1 ? 'cuota sin cobrar' : 'cuotas sin cobrar'}`]
      .filter(Boolean).join(' · ')
    : 'Nadie te debe nada';
  return [
    {
      key: 'revenue', label: 'Ingresos', icon: 'wallet', tint: 'mat', value: k.revenue, format: 'money', spark: null, to: '',
      delta: k.revenue_change_pct === null ? null : { value: k.revenue_change_pct, kind: 'pct', label: d.compare_label, trend: trend(k.revenue_change_pct) },
      hint: k.revenue ? `${k.count} cobros` : 'Sin cobros en este periodo',
    },
    { key: 'pending', label: 'Pendiente de cobro', icon: 'card', tint: 'barre', value: k.pending, format: 'money', spark: null, to: '', delta: null, hint: owedHint },
    {
      key: 'packs', label: 'Bonos vendidos', icon: 'ticket', tint: 'yoga', value: k.packs_sold, format: 'count', spark: null, to: '',
      delta: k.packs_sold || k.packs_sold_prev ? { value: k.packs_sold - k.packs_sold_prev, kind: 'abs', label: d.compare_label, trend: trend(k.packs_sold - k.packs_sold_prev) } : null,
      hint: 'Aún no has vendido bonos',
    },
    {
      key: 'subs', label: 'Cuotas activas', icon: 'users', tint: 'privada', value: k.subscriptions_active, format: 'count', spark: null, to: '', delta: null,
      hint: k.subscriptions_active ? `${fmtMoney(k.monthly_recurring, d.currency)} al mes` : 'Nadie paga cuota todavía',
    },
  ];
}

function ReceiptDialog({ row, data, onClose }: { row: CollectedRow | null; data: SalesData; onClose: () => void }) {
  if (!row) return null;
  const s = data.studio;
  return (
    <Dialog open onClose={onClose} aria-labelledby="rc-title" fullWidth maxWidth="xs">
      <DialogTitle id="rc-title">Recibo {row.receipt_no}</DialogTitle>
      <DialogContent>
        <Box className="studio-light" sx={{ p: 2, borderRadius: 'var(--studio-radius-md)', border: '1px solid var(--studio-border-color)', '@media print': { border: 0 } }}>
          <Typography sx={{ fontWeight: 700 }}>{s.legal_name}</Typography>
          {s.tax_id && <Typography sx={{ fontSize: '0.88rem' }}>NIF {s.tax_id}</Typography>}
          {s.address && <Typography sx={{ fontSize: '0.88rem' }}>{s.address}</Typography>}
          <Box sx={{ my: 1.5, borderTop: '1px dashed var(--studio-border-strong)' }} />
          <Typography sx={{ fontSize: '0.9rem' }}>Recibo nº <b>{row.receipt_no}</b> · {shortDate(row.date)} {row.time}</Typography>
          <Typography sx={{ fontSize: '0.9rem' }}>Clienta: <b>{row.name}</b>{row.email ? ` (${row.email})` : ''}</Typography>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mt: 1.5 }}>
            <Typography>{row.concept}<br /><Typography component="span" sx={{ fontSize: '0.82rem', color: 'var(--studio-muted)' }}>{row.method}</Typography></Typography>
            <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtMoney(row.amount, data.currency)}</Typography>
          </Box>
          {!s.tax_id && <Alert severity="info" sx={{ mt: 2 }}>Añade tu NIF en Ajustes → Datos y logo para que salga en los recibos.</Alert>}
        </Box>
      </DialogContent>
      <DialogActions>
        {row.receipt_url && (
          <Button component="a" href={row.receipt_url} target="_blank" rel="noopener" startIcon={<OpenInNewRoundedIcon />}>Recibo de Stripe</Button>
        )}
        <Button onClick={() => window.print()} startIcon={<PrintOutlinedIcon />}>Imprimir</Button>
        <Button variant="contained" onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}

function Amount({ v, currency, muted }: { v: number; currency: string; muted?: boolean }) {
  return <Typography component="b" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: muted ? 'var(--studio-muted)' : 'var(--studio-ink)', textDecoration: muted ? 'line-through' : 'none' }}>{fmtMoney(v, currency)}</Typography>;
}

const rowWrap = { ...rowSx, flexWrap: { xs: 'wrap', sm: 'nowrap' } } as const;
const midSx = { flex: { xs: '1 1 calc(100% - 60px)', sm: 1 }, minWidth: 0 } as const;
const rowRight = { display: 'flex', alignItems: 'center', gap: 1, ml: { xs: '46px', sm: 0 }, flex: 'none' } as const;

export default function SalesPage() {
  const navigate = useNavigate();
  const notify = useNotify();
  const [period, setPeriodState] = useState<Period>(readPeriod);
  const [tab, setTab] = useState<TabKey>('owed');
  const [data, setData] = useState<SalesData | null>(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [receipt, setReceipt] = useState<CollectedRow | null>(null);
  const [sent, setSent] = useState<Record<string, boolean>>({});

  const load = useCallback((p: Period) => {
    setError('');
    dashApi.sales(p).then((d) => {
      setData(d);
      setTab((t) => (t === 'owed' && !d.owed.length ? 'collected' : t));
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => { load(period); }, [load, period]);

  const setPeriod = (p: Period) => {
    setPeriodState(p);
    try { localStorage.setItem(LS_PERIOD, p); } catch { /* sin almacenamiento */ }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const name = await dashApi.exportSales(period);
      notify(`Descargado: ${name}. Ábrelo con Excel o mándalo tal cual a tu gestoría.`);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setExporting(false);
    }
  };

  const resend = async (o: OwedRow) => {
    try {
      const r = await dashApi.action(o.kind === 'payment'
        ? { kind: 'resend_payment_link', payment_id: o.payment_id }
        : { kind: 'resend_payment_link', subscription_id: o.subscription_id });
      setSent((s) => ({ ...s, [o.id]: true }));
      notify(r.done);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const cur = data?.currency || 'EUR';
  const receipts = (data?.collected || []).filter((r) => r.status === 'succeeded');
  const tabs: { value: TabKey; label: string }[] = [
    { value: 'owed', label: `Quién me debe${data?.owed.length ? ` (${data.owed.length})` : ''}` },
    { value: 'collected', label: 'Lo cobrado' },
    { value: 'plans', label: 'Bonos y cuotas' },
    { value: 'receipts', label: 'Recibos' },
  ];

  let body = null;
  if (data) {
    if (tab === 'owed') {
      body = data.owed.length === 0 ? (
        <EmptyBox icon={<SentimentSatisfiedAltRoundedIcon />} title="Nadie te debe nada" text="Aquí aparecen los pagos que fallan y las cuotas que Stripe no ha podido cobrar, con un botón para reenviar el enlace de pago." />
      ) : data.owed.map((o) => (
        <Box key={o.id} sx={rowWrap}>
          <Avatar name={o.name} size={34} ring={false} />
          <Box sx={midSx}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.94rem', color: 'var(--studio-ink)' }}>{o.name}</Typography>
            <Typography sx={{ fontSize: '0.82rem', color: 'var(--studio-muted)' }}>{o.concept} · {shortDate(o.date)}</Typography>
          </Box>
          <Box sx={rowRight}>
            <Amount v={o.amount} currency={cur} />
            <Tag tone={o.status === 'failed' ? 'bad' : 'warn'}>{o.status_label}</Tag>
            {sent[o.id]
              ? <Tag tone="ok">Enviado</Tag>
              : <TonalButton size="small" onClick={() => resend(o)} aria-label={`Reenviar enlace de pago a ${o.name}`}>Reenviar</TonalButton>}
          </Box>
        </Box>
      ));
    } else if (tab === 'collected') {
      body = data.collected.length === 0 ? (
        <EmptyBox icon={<AccountBalanceWalletOutlinedIcon />} title="Aún no hay cobros en este periodo"
          text="Cuando vendas un bono, una cuota o una clase, aparecerá aquí."
          examples={['Nuria compró Bono 10 clases · tarjeta', 'Paula pagó su cuota mensual', 'Julia pagó una clase de prueba']}
          actions={<>
            <Button variant="contained" startIcon={<CreditCardOutlinedIcon />} onClick={() => navigate('/ajustes?tab=pagos')}>Activar pagos online</Button>
            <Button variant="outlined" onClick={() => navigate('/credits?accion=anadir')}>Apuntar un cobro en mano</Button>
          </>} />
      ) : (
        <>
          {data.collected.map((r) => (
            <Box key={r.id} sx={rowWrap}>
              <Avatar name={r.name} size={34} ring={false} />
              <Box sx={midSx}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.94rem', color: 'var(--studio-ink)' }}>{r.name}</Typography>
                <Typography sx={{ fontSize: '0.82rem', color: 'var(--studio-muted)' }}>{r.concept} · {r.method.toLowerCase()} · {shortDate(r.date)}</Typography>
              </Box>
              <Box sx={rowRight}>
                <Amount v={r.amount} currency={cur} muted={r.status === 'refunded'} />
                <Tag tone={r.status === 'refunded' ? 'n' : 'ok'}>{r.status === 'refunded' ? 'Devuelto' : 'Cobrado'}</Tag>
              </Box>
            </Box>
          ))}
          {data.collected_total > data.collected.length && (
            <Typography sx={{ ...rowSx, color: 'var(--studio-muted)', fontSize: '0.88rem' }}>
              Y {data.collected_total - data.collected.length} más: están todos en el cierre para la gestoría.
            </Typography>
          )}
        </>
      );
    } else if (tab === 'plans') {
      body = (
        <>
          {data.plans.map((p) => (
            <Box key={p.id} sx={rowWrap}>
              <IBadge size={34}><ConfirmationNumberOutlinedIcon sx={{ fontSize: 18 }} /></IBadge>
              <Box sx={midSx}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.94rem', color: 'var(--studio-ink)' }}>{p.name}</Typography>
                <Typography sx={{ fontSize: '0.82rem', color: 'var(--studio-muted)' }}>
                  {p.type === 'sub' ? `Cuota · ${p.subscribers} ${p.subscribers === 1 ? 'clienta' : 'clientas'}` : `${p.credits} ${p.credits === 1 ? 'clase' : 'clases'}`}
                  {' · '}{p.sold ? `${p.sold} ${p.sold === 1 ? 'vendido' : 'vendidos'} (${fmtMoney(p.revenue, cur)})` : 'sin ventas en el periodo'}
                </Typography>
              </Box>
              <Box sx={rowRight}>
                <Amount v={p.price} currency={cur} />
                <Tag tone={p.active ? 'ok' : 'n'}>{p.active ? 'A la venta' : 'Oculto'}</Tag>
              </Box>
            </Box>
          ))}
          <Box sx={{ ...rowSx, flexWrap: 'wrap', gap: 1 }}>
            <TonalButton size="small" onClick={() => navigate('/clases-y-precios?tab=precios')}>{data.plans.length ? 'Editar bonos y cuotas' : 'Crear el primer bono'}</TonalButton>
            <Button size="small" onClick={() => navigate('/subscriptions')}>Membresías</Button>
            <Button size="small" onClick={() => navigate('/credits')}>Créditos de clientas</Button>
            <Button size="small" onClick={() => navigate('/cuopon')}>Cupones</Button>
          </Box>
        </>
      );
    } else {
      body = receipts.length === 0 ? (
        <EmptyBox icon={<ReceiptLongOutlinedIcon />} title="Aún no hay recibos" text="Cada cobro tiene su recibo con tu NIF, listo para imprimir o enviar." />
      ) : receipts.map((r) => (
        <Box key={r.id} sx={rowWrap}>
          <IBadge size={34}><ReceiptLongOutlinedIcon sx={{ fontSize: 18 }} /></IBadge>
          <Box sx={midSx}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.94rem', color: 'var(--studio-ink)', fontVariantNumeric: 'tabular-nums' }}>{r.receipt_no}</Typography>
            <Typography sx={{ fontSize: '0.82rem', color: 'var(--studio-muted)' }}>{r.name} · {shortDate(r.date)}</Typography>
          </Box>
          <Box sx={rowRight}>
            <Amount v={r.amount} currency={cur} />
            <Button size="small" variant="outlined" onClick={() => setReceipt(r)} aria-label={`Ver recibo ${r.receipt_no}`}>Ver</Button>
          </Box>
        </Box>
      ));
    }
  }

  return (
    <Box sx={{ pb: 2 }}>
      <PageHead icon={<AccountBalanceWalletOutlinedIcon />} title="Ventas" tint="mat" page="sales"
        sub={data ? `${data.label}${data.period === 'year' || data.period === 'quarter' || data.period === 'month' ? ` · hasta el ${shortDate(data.end)}` : ''}` : undefined}
        actions={<>
          <Button variant="outlined" onClick={exportCsv} disabled={exporting} startIcon={<DownloadRoundedIcon />} data-tour="sales-export"
            aria-label="Cierre para la gestoría: descargar los cobros del periodo en Excel (CSV)">
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Cierre para la gestoría</Box>
            <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>Cierre</Box>
          </Button>
          <Button variant="contained" startIcon={<CreditCardOutlinedIcon />} onClick={() => navigate('/credits?accion=anadir')}>Cobrar</Button>
        </>} />

      <Seg value={period} options={PERIODS} onChange={setPeriod} label="Periodo" tour="sales-period" sx={{ mb: 2 }} />

      {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" onClick={() => load(period)}>Reintentar</Button>}>{error}</Alert>}

      <Box component="section" aria-label="Cifras del periodo" data-tour="sales-kpis" sx={{ display: 'grid', gap: { xs: 1.25, sm: 1.75 }, mb: 2, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' } }}>
        {data ? kpisOf(data).map((k) => <KpiCard key={k.key} k={k} currency={cur} />)
          : [0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={128} sx={{ borderRadius: 'var(--studio-radius-lg)' }} />)}
      </Box>

      <Card labelledBy="sc-h" sx={{ mb: 2 }}>
        <CardHead id="sc-h" title="Ingresos" right={data ? <Typography sx={{ fontSize: '0.85rem', color: 'var(--studio-muted)' }}>{data.compare_label}</Typography> : undefined} />
        {data ? <SalesChart data={data} /> : <Skeleton variant="rounded" height={170} />}
      </Card>

      <Seg value={tab} options={tabs} onChange={setTab} label="Qué ver" sx={{ mb: 1.5, flexWrap: { xs: 'wrap', sm: 'nowrap' } }} />
      <Box role="tabpanel" aria-label={tabs.find((t) => t.value === tab)?.label}>
        <Card sx={{ p: '0 !important', overflow: 'hidden' }}>
          {data ? body : [0, 1, 2].map((i) => <Skeleton key={i} height={64} sx={{ mx: 2 }} />)}
        </Card>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 2.5, fontSize: '0.88rem' }}>
        <Typography component="span" sx={{ color: 'var(--studio-muted)', fontSize: 'inherit' }}>Más:</Typography>
        {[['Todos los pagos', '/payments'], ['Membresías', '/subscriptions'], ['Candidatas a membresía', '/membership-candidates'], ['Cupones', '/cuopon'], ['Créditos', '/credits']].map(([l, to]) => (
          <Link key={to} component="button" onClick={() => navigate(to)} sx={{ fontSize: 'inherit', fontWeight: 600, color: 'var(--studio-primary-text)', minHeight: 24 }}>{l}</Link>
        ))}
      </Box>

      {data && <ReceiptDialog row={receipt} data={data} onClose={() => setReceipt(null)} />}
    </Box>
  );
}
