import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, 
  Download, 
  BarChart3, 
  CheckCircle2,
  AlertTriangle,
  Send,
  Clock,
  Loader2,
  RefreshCw,
  Settings2,
  Calendar,
  Mail,
  ToggleLeft,
  ToggleRight,
  Save,
  Eye,
  X,
  Globe,
  Shield,
  Activity,
  Printer
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '@/lib/supabase';
import LoadingScreen from './LoadingScreen';
import jsPDF from 'jspdf';

interface MonthlyData {
  name: string;
  uptime: number;
  incidents: number;
}

interface ProjectReport {
  id: string;
  name: string;
  url: string;
  uptime: number;
  incidents: number;
  updates: number;
  pluginsTotal: number;
  avgResponseTime: number;
  ownerEmail: string;
  ownerName: string;
}

interface ReportConfig {
  autoSend: boolean;
  sendDay: number; // 1-28
  sendToClients: boolean;
  sendToAdmin: boolean;
  includeChart: boolean;
}

const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const monthNamesFull = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const DEFAULT_CONFIG: ReportConfig = {
  autoSend: false,
  sendDay: 28,
  sendToClients: true,
  sendToAdmin: true,
  includeChart: true,
};

export default function ReportsView() {
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<MonthlyData[]>([]);
  const [projectReports, setProjectReports] = useState<ProjectReport[]>([]);
  const [globalStats, setGlobalStats] = useState({ avgUptime: 0, totalIncidents: 0, totalUpdates: 0 });
  const [showConfig, setShowConfig] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [previewReport, setPreviewReport] = useState<ProjectReport | null>(null);
  const [previewTab, setPreviewTab] = useState<'email' | 'pdf'>('email');

  // Month/year selector
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const currentMonth = `${monthNamesFull[selectedMonth]} ${selectedYear}`;

  // Client filter
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [selectedClient, setSelectedClient] = useState('all');

  const [config, setConfig] = useState<ReportConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    loadConfig();
    loadClients();
    loadReports();
  }, [selectedMonth, selectedYear]);

  const loadClients = async () => {
    const { data } = await supabase.from('profiles').select('id, full_name').eq('role', 'client').order('full_name');
    if (data) setClients(data.map(c => ({ id: c.id, name: c.full_name || 'Sin nombre' })));
  };

  const loadConfig = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('report_settings')
      .select('auto_send, send_day, send_to_clients, send_to_admin, include_chart')
      .eq('user_id', user.id)
      .single();
    if (data) {
      setConfig({
        autoSend: data.auto_send,
        sendDay: data.send_day,
        sendToClients: data.send_to_clients,
        sendToAdmin: data.send_to_admin,
        includeChart: data.include_chart,
      });
    }
  };

  const saveConfig = async (newConfig: ReportConfig) => {
    setConfig(newConfig);
    setSavingConfig(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('report_settings').upsert({
        user_id: user.id,
        auto_send: newConfig.autoSend,
        send_day: newConfig.sendDay,
        send_to_clients: newConfig.sendToClients,
        send_to_admin: newConfig.sendToAdmin,
        include_chart: newConfig.includeChart,
      }, { onConflict: 'user_id' });
    }
    setSavingConfig(false);
  };

  const loadReports = async () => {
    setLoading(true);

    // Fetch all needed data in parallel
    const sixMonthsAgo = new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1).toISOString();
    const [projectsRes, incidentsRes, profilesRes, pluginsRes, logsRes] = await Promise.all([
      supabase.from('projects').select('id, name, url, uptime_percent, owner_id').eq('is_active', true).order('name'),
      supabase.from('incidents').select('id, project_id, started_at').gte('started_at', sixMonthsAgo),
      supabase.from('profiles').select('id, full_name, email'),
      supabase.from('project_plugins').select('id, project_id, current_version, latest_version'),
      supabase.from('uptime_logs').select('project_id, status, response_time_ms, checked_at').gte('checked_at', sixMonthsAgo).order('checked_at', { ascending: false }),
    ]);

    const projects = projectsRes.data || [];
    const allIncidents = incidentsRes.data || [];
    const profiles = profilesRes.data || [];
    const allPlugins = pluginsRes.data || [];
    const allLogs = logsRes.data || [];

    const profileMap = new Map(profiles.map(p => [p.id, p]));

    // Count outdated plugins as "updates" (real data)
    const outdatedPlugins = allPlugins.filter(p =>
      p.latest_version && p.latest_version !== '' && p.latest_version !== 'unknown' && p.latest_version !== p.current_version
    );

    // Calculate real avg uptime from last 30 days of logs
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recentLogs = allLogs.filter(l => l.checked_at >= thirtyDaysAgo);
    const avgUptime = recentLogs.length > 0
      ? Number(((recentLogs.filter(l => l.status === 'up' || l.status === 'warning').length / recentLogs.length) * 100).toFixed(2))
      : projects.length > 0 ? Number((projects.reduce((a, p) => a + Number(p.uptime_percent), 0) / projects.length).toFixed(2)) : 100;

    setGlobalStats({
      avgUptime,
      totalIncidents: allIncidents.length,
      totalUpdates: outdatedPlugins.length,
    });

    const reports: ProjectReport[] = projects.map(p => {
      const owner = profileMap.get(p.owner_id);
      const projectLogs = allLogs.filter(l => l.project_id === p.id && l.response_time_ms && l.response_time_ms > 0);
      const avgRt = projectLogs.length > 0
        ? Math.round(projectLogs.slice(0, 100).reduce((a, l) => a + Number(l.response_time_ms), 0) / Math.min(projectLogs.length, 100))
        : 0;
      const projRecentLogs = recentLogs.filter(l => l.project_id === p.id);
      const projUptime = projRecentLogs.length > 0
        ? Number(((projRecentLogs.filter(l => l.status === 'up' || l.status === 'warning').length / projRecentLogs.length) * 100).toFixed(2))
        : Number(p.uptime_percent);
      return {
        id: p.id,
        name: p.name,
        url: p.url || '',
        uptime: projUptime,
        incidents: allIncidents.filter(i => i.project_id === p.id).length,
        updates: outdatedPlugins.filter(pl => pl.project_id === p.id).length,
        pluginsTotal: allPlugins.filter(pl => pl.project_id === p.id).length,
        avgResponseTime: avgRt,
        ownerEmail: owner?.email || '',
        ownerName: owner?.full_name || 'Sin asignar',
      };
    });
    setProjectReports(reports);

    // Build chart from real uptime_logs (last 6 months)
    const chart: MonthlyData[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStart = d.toISOString();
      const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString();
      const monthIncidents = allIncidents.filter(inc => inc.started_at >= monthStart && inc.started_at < nextMonth).length;
      const monthLogs = allLogs.filter(l => l.checked_at >= monthStart && l.checked_at < nextMonth);
      const monthUptime = monthLogs.length > 0
        ? Number(((monthLogs.filter(l => l.status === 'up' || l.status === 'warning').length / monthLogs.length) * 100).toFixed(2))
        : avgUptime;

      chart.push({
        name: monthNames[d.getMonth()],
        uptime: monthUptime,
        incidents: monthIncidents,
      });
    }
    setChartData(chart);
    setLoading(false);
  };

  const getUptimeVerdict = (uptime: number) => {
    if (uptime >= 99.9) return { text: 'excelente', emoji: '🟢', color: '#4ade80', bg: 'rgba(74,222,128,0.1)' };
    if (uptime >= 99) return { text: 'muy bueno', emoji: '🟢', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' };
    if (uptime >= 97) return { text: 'aceptable, aunque con margen de mejora', emoji: '🟡', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' };
    return { text: 'por debajo de lo ideal y estamos trabajando en mejorarlo', emoji: '🔴', color: '#f87171', bg: 'rgba(248,113,113,0.1)' };
  };

  const getResponseVerdict = (ms: number) => {
    if (ms === 0) return '';
    if (ms < 500) return 'Tu sitio carga bastante rápido.';
    if (ms < 1000) return 'El tiempo de respuesta está dentro de lo normal.';
    return 'El tiempo de respuesta es un poco alto, lo tenemos en observación.';
  };

  const buildReportHtml = (report: ProjectReport) => {
    const v = getUptimeVerdict(report.uptime);
    const rtVerdict = getResponseVerdict(report.avgResponseTime);
    const dateStr = new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const firstName = report.ownerName.split(' ')[0];
    const incidentText = report.incidents === 0
      ? 'No se registraron incidentes este mes. ¡Todo funcionó sin problemas!'
      : report.incidents === 1
        ? 'Se detectó 1 incidente que fue gestionado y resuelto oportunamente.'
        : `Se detectaron ${report.incidents} incidentes que fueron gestionados durante el mes.`;
    const updateText = report.updates === 0
      ? 'No hubo actualizaciones de plugins o temas pendientes este mes.'
      : report.updates === 1
        ? 'Se aplicó 1 actualización de seguridad/funcionalidad para mantener tu sitio al día.'
        : `Se aplicaron ${report.updates} actualizaciones de plugins y temas para mantener tu sitio seguro y al día.`;
    const pluginText = report.pluginsTotal > 0
      ? `Tu sitio tiene ${report.pluginsTotal} plugins/temas instalados que monitoreamos constantemente.`
      : '';

    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #e0e0e0; padding: 32px; border-radius: 12px;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="margin-bottom: 4px;"><span style="font-size: 22px; font-weight: bold; color: #fff;">Lumina<span style="color: #a78bfa;">Support</span></span></div>
          <p style="color: #a78bfa; font-size: 11px; margin: 0 0 4px; font-weight: 500;">por Luis Salas Cortés</p>
          <p style="color: #888; font-size: 12px; margin: 0;">Informe de Mantenimiento</p>
        </div>

        <!-- Greeting -->
        <div style="margin-bottom: 24px;">
          <p style="color: #fff; font-size: 15px; margin: 0 0 12px; font-weight: 600;">¡Hola ${firstName}! 👋</p>
          <p style="color: #ccc; font-size: 13px; line-height: 1.6; margin: 0;">Te compartimos el resumen de <strong style="color: #a78bfa;">${report.name}</strong> correspondiente a <strong>${currentMonth}</strong>. Aquí va un vistazo rápido de cómo estuvo todo:</p>
        </div>

        <!-- KPIs -->
        <div style="margin-bottom: 20px;">
          <p style="color: #fff; font-size: 13px; font-weight: 600; margin: 0 0 12px;">📊 Indicadores Clave</p>
          <table style="width: 100%; border-collapse: separate; border-spacing: 8px 0;">
            <tr>
              <td style="text-align: center; padding: 16px 8px; background: #16162a; border: 1px solid #2a2a4a; border-radius: 10px; width: 25%;">
                <p style="color: #888; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 6px;">Uptime</p>
                <p style="color: ${v.color}; font-size: 22px; font-weight: bold; margin: 0;">${report.uptime}%</p>
              </td>
              <td style="text-align: center; padding: 16px 8px; background: #16162a; border: 1px solid #2a2a4a; border-radius: 10px; width: 25%;">
                <p style="color: #888; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 6px;">Incidentes</p>
                <p style="color: ${report.incidents === 0 ? '#4ade80' : '#fbbf24'}; font-size: 22px; font-weight: bold; margin: 0;">${report.incidents}</p>
              </td>
              <td style="text-align: center; padding: 16px 8px; background: #16162a; border: 1px solid #2a2a4a; border-radius: 10px; width: 25%;">
                <p style="color: #888; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 6px;">Updates</p>
                <p style="color: #fff; font-size: 22px; font-weight: bold; margin: 0;">${report.updates}</p>
              </td>
              ${report.avgResponseTime > 0 ? `<td style="text-align: center; padding: 16px 8px; background: #16162a; border: 1px solid #2a2a4a; border-radius: 10px; width: 25%;">
                <p style="color: #888; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 6px;">Velocidad</p>
                <p style="color: #38bdf8; font-size: 22px; font-weight: bold; margin: 0;">${report.avgResponseTime}<span style="font-size: 11px; font-weight: normal;">ms</span></p>
              </td>` : ''}
            </tr>
          </table>
        </div>

        <!-- Monthly summary -->
        <div style="background: #16162a; border: 1px solid #2a2a4a; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <p style="color: #fff; font-size: 13px; font-weight: 600; margin: 0 0 12px;">📝 Resumen del Mes</p>
          <p style="color: #ccc; font-size: 13px; line-height: 1.7; margin: 0 0 12px;">La disponibilidad de tu sitio fue <strong style="color: ${v.color};">${v.text}</strong>, con un uptime del ${report.uptime}%. ${rtVerdict}</p>
          <p style="color: #ccc; font-size: 13px; line-height: 1.7; margin: 0 0 12px;">${incidentText}</p>
          <p style="color: #ccc; font-size: 13px; line-height: 1.7; margin: 0;">${updateText}${pluginText ? ' ' + pluginText : ''}</p>
        </div>

        <!-- Status badge -->
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="display: inline-block; padding: 8px 20px; border-radius: 999px; font-size: 12px; font-weight: 600; background: ${v.bg}; color: ${v.color};">${v.emoji} Estado general: ${v.text.charAt(0).toUpperCase() + v.text.slice(1)}</span>
        </div>

        <!-- Footer -->
        <div style="text-align: center; padding-top: 16px; border-top: 1px solid #2a2a4a;">
          <p style="color: #888; font-size: 12px; margin: 0 0 4px;">¿Tienes dudas? Responde este correo y con gusto te ayudamos.</p>
          <p style="color: #555; font-size: 10px; margin: 0;">LuminaSupport · Generado el ${dateStr}</p>
          <p style="color: #444; font-size: 10px; margin: 4px 0 0;">📎 PDF adjunto con el informe completo</p>
        </div>
      </div>
    `;
  };

  const buildReportPdf = (report: ProjectReport): string => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const w = doc.internal.pageSize.getWidth();
    const v = getUptimeVerdict(report.uptime);
    const dateStr = new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const firstName = report.ownerName.split(' ')[0];
    let y = 20;

    // Header bar
    doc.setFillColor(26, 26, 46);
    doc.rect(0, 0, w, 40, 'F');
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text('LuminaSupport', 20, 16);
    doc.setFontSize(9);
    doc.setTextColor(167, 139, 250);
    doc.text('por Luis Salas Cortés', 20, 22);
    doc.setFontSize(10);
    doc.text('Informe de Mantenimiento Mensual', 20, 28);
    doc.setTextColor(150, 150, 170);
    doc.text(`${currentMonth} · Ref: RPT-${report.id.slice(0, 8).toUpperCase()}`, 20, 33);
    doc.setTextColor(150, 150, 170);
    doc.text(dateStr, w - 20, 33, { align: 'right' });

    y = 52;

    // Project info box
    doc.setFillColor(245, 245, 252);
    doc.roundedRect(20, y, w - 40, 28, 3, 3, 'F');
    doc.setFontSize(14);
    doc.setTextColor(26, 26, 46);
    doc.text(report.name, 28, y + 10);
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 140);
    doc.text(report.url, 28, y + 17);
    doc.text(`Cliente: ${report.ownerName}`, w - 28, y + 10, { align: 'right' });
    doc.text(report.ownerEmail || '', w - 28, y + 17, { align: 'right' });

    y += 38;

    // Greeting
    doc.setFontSize(11);
    doc.setTextColor(50, 50, 60);
    doc.text(`Hola ${firstName},`, 20, y);
    y += 7;
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 90);
    const introLines = doc.splitTextToSize(
      `Te compartimos el resumen de mantenimiento de tu sitio correspondiente a ${currentMonth}. A continuación encontrarás los indicadores clave y un resumen de las actividades realizadas.`,
      w - 40
    );
    doc.text(introLines, 20, y);
    y += introLines.length * 5 + 10;

    // KPIs
    const kpiW = (w - 50) / 4;
    const kpis = [
      { label: 'Disponibilidad', value: `${report.uptime}%`, color: v.color === '#4ade80' ? [74, 222, 128] : v.color === '#a78bfa' ? [167, 139, 250] : [251, 191, 36] },
      { label: 'Incidentes', value: `${report.incidents}`, color: report.incidents === 0 ? [74, 222, 128] : [251, 191, 36] },
      { label: 'Actualizaciones', value: `${report.updates}`, color: [167, 139, 250] },
      { label: 'Velocidad Prom.', value: report.avgResponseTime > 0 ? `${report.avgResponseTime}ms` : 'N/A', color: [56, 189, 248] },
    ];

    kpis.forEach((kpi, i) => {
      const kx = 20 + i * (kpiW + 5);
      doc.setFillColor(245, 245, 252);
      doc.roundedRect(kx, y, kpiW, 30, 2, 2, 'F');
      doc.setDrawColor(230, 230, 240);
      doc.roundedRect(kx, y, kpiW, 30, 2, 2, 'S');
      doc.setFontSize(7);
      doc.setTextColor(130, 130, 150);
      doc.text(kpi.label.toUpperCase(), kx + kpiW / 2, y + 10, { align: 'center' });
      doc.setFontSize(16);
      doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
      doc.text(kpi.value, kx + kpiW / 2, y + 23, { align: 'center' });
    });

    y += 42;

    // Monthly summary section
    doc.setFontSize(12);
    doc.setTextColor(26, 26, 46);
    doc.text('Resumen del Mes', 20, y);
    y += 8;

    doc.setFontSize(10);
    doc.setTextColor(70, 70, 85);

    const uptimeParagraph = `La disponibilidad de tu sitio fue ${v.text}, manteniéndose en un ${report.uptime}% durante el período.${report.avgResponseTime > 0 ? ` El tiempo de respuesta promedio fue de ${report.avgResponseTime}ms.` : ''}`;
    const uptimeLines = doc.splitTextToSize(uptimeParagraph, w - 40);
    doc.text(uptimeLines, 20, y);
    y += uptimeLines.length * 5 + 4;

    const incidentParagraph = report.incidents === 0
      ? 'No se registraron incidentes durante este mes. Todo funcionó sin problemas.'
      : report.incidents === 1
        ? 'Se detectó 1 incidente que fue gestionado y resuelto oportunamente por el equipo.'
        : `Se detectaron ${report.incidents} incidentes que fueron gestionados y resueltos durante el mes.`;
    const incLines = doc.splitTextToSize(incidentParagraph, w - 40);
    doc.text(incLines, 20, y);
    y += incLines.length * 5 + 4;

    const updateParagraph = report.updates === 0
      ? 'No hubo actualizaciones de plugins o temas pendientes durante este período.'
      : `Se aplicaron ${report.updates} actualizaciones de plugins y temas para mantener el sitio seguro y actualizado.${report.pluginsTotal > 0 ? ` Se monitorean ${report.pluginsTotal} componentes en total.` : ''}`;
    const updLines = doc.splitTextToSize(updateParagraph, w - 40);
    doc.text(updLines, 20, y);
    y += updLines.length * 5 + 10;

    // Detail table
    doc.setFontSize(12);
    doc.setTextColor(26, 26, 46);
    doc.text('Detalle', 20, y);
    y += 8;

    const rows = [
      ['Disponibilidad (Uptime)', `${report.uptime}%`, v.text.charAt(0).toUpperCase() + v.text.slice(1)],
      ['Incidentes Detectados', `${report.incidents}`, report.incidents === 0 ? 'Sin incidentes' : 'Gestionados'],
      ['Actualizaciones Aplicadas', `${report.updates}`, report.updates > 0 ? 'Completado' : 'Sin pendientes'],
      ['Plugins/Temas Monitoreados', `${report.pluginsTotal}`, report.pluginsTotal > 0 ? 'Activo' : 'N/A'],
      ['Velocidad Promedio', report.avgResponseTime > 0 ? `${report.avgResponseTime}ms` : 'N/A', report.avgResponseTime < 500 ? 'Rápido' : report.avgResponseTime < 1000 ? 'Normal' : 'Lento'],
      ['Período', currentMonth, ''],
    ];

    doc.setFontSize(8);
    // Table header
    doc.setFillColor(240, 240, 248);
    doc.rect(20, y, w - 40, 7, 'F');
    doc.setTextColor(100, 100, 120);
    doc.text('MÉTRICA', 24, y + 5);
    doc.text('VALOR', w / 2, y + 5, { align: 'center' });
    doc.text('ESTADO', w - 24, y + 5, { align: 'right' });
    y += 9;

    doc.setFontSize(9);
    rows.forEach((row) => {
      doc.setTextColor(50, 50, 60);
      doc.text(row[0], 24, y + 4);
      doc.setTextColor(26, 26, 46);
      doc.text(row[1], w / 2, y + 4, { align: 'center' });
      doc.setTextColor(120, 100, 180);
      doc.text(row[2], w - 24, y + 4, { align: 'right' });
      doc.setDrawColor(235, 235, 245);
      doc.line(20, y + 7, w - 20, y + 7);
      y += 9;
    });

    y += 8;

    // Footer
    doc.setDrawColor(200, 200, 220);
    doc.line(20, y, w - 20, y);
    y += 6;
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 175);
    doc.text('Generado por LuminaSupport', 20, y);
    doc.text(`Página 1 de 1 · ${dateStr}`, w - 20, y, { align: 'right' });

    return doc.output('datauristring').split(',')[1];
  };

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const callSendReport = async (to: string[], subject: string, html: string, pdfBase64?: string, pdfFilename?: string): Promise<boolean> => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON}`,
      },
      body: JSON.stringify({ to, subject, html, pdfBase64, pdfFilename }),
    });
    const body = await res.json().catch(() => null);
    console.log('[callSendReport] Response:', res.status, body);
    return res.ok;
  };

  const sendReport = async (report: ProjectReport) => {
    setSending(report.id);
    try {
      const htmlBody = buildReportHtml(report);
      const pdfBase64 = buildReportPdf(report);
      const pdfFilename = `Informe-${report.name.replace(/\s+/g, '-')}-${currentMonth.replace(/\s+/g, '-')}.pdf`;
      const recipients: string[] = [];
      if (config.sendToClients && report.ownerEmail) recipients.push(report.ownerEmail);
      if (config.sendToAdmin) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email && !recipients.includes(user.email)) recipients.push(user.email);
      }

      if (recipients.length === 0) {
        setSendSuccess('no-recipients');
        setTimeout(() => setSendSuccess(null), 3000);
        setSending(null);
        return;
      }

      const ok = await callSendReport(recipients, `📊 Informe Mensual — ${report.name} — ${currentMonth}`, htmlBody, pdfBase64, pdfFilename);
      setSendSuccess(ok ? report.id : 'error');
    } catch {
      setSendSuccess('error');
    }
    setSending(null);
    setTimeout(() => setSendSuccess(null), 3000);
  };

  const sendReportToAdmin = async (report: ProjectReport) => {
    setSending(`admin-${report.id}`);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        setSendSuccess('no-recipients');
        setTimeout(() => setSendSuccess(null), 3000);
        setSending(null);
        return;
      }

      const htmlBody = buildReportHtml(report);
      const pdfBase64 = buildReportPdf(report);
      const pdfFilename = `Informe-${report.name.replace(/\s+/g, '-')}-${currentMonth.replace(/\s+/g, '-')}.pdf`;
      const ok = await callSendReport([user.email], `📊 Informe Mensual — ${report.name} — ${currentMonth}`, htmlBody, pdfBase64, pdfFilename);
      setSendSuccess(ok ? `admin-${report.id}` : 'error');
    } catch (err) {
      console.error('[sendReportToAdmin] Excepción:', err);
      setSendSuccess('error');
    }
    setSending(null);
    setTimeout(() => setSendSuccess(null), 5000);
  };

  const sendAllReports = async () => {
    setSendingAll(true);
    for (const report of projectReports) {
      await sendReport(report);
    }
    setSendingAll(false);
  };

  // Filter reports by selected client
  const filteredReports = selectedClient === 'all'
    ? projectReports
    : projectReports.filter(r => {
        const proj = projectReports.find(p => p.id === r.id);
        return proj && clients.some(c => c.id === selectedClient && c.name === r.ownerName);
      });

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">Informes Mensuales</h1>
          <p className="text-sm text-text-muted">Generación y envío de reportes de salud a clientes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="cursor-pointer rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-primary">
              {monthNamesFull.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="cursor-pointer rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-primary">
              {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)} className="cursor-pointer rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-primary">
            <option value="all">Todos los clientes</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={() => setShowConfig(!showConfig)} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-muted hover:text-white hover:bg-surface-hover transition-colors">
            <Settings2 size={16} />
            Configurar
          </button>
          <button onClick={sendAllReports} disabled={sendingAll || filteredReports.length === 0} className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover shadow-lg shadow-primary/20 disabled:opacity-50">
            {sendingAll ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Enviar Todos
          </button>
        </div>
      </div>

      {/* Config Panel */}
      <AnimatePresence>
        {showConfig && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="glass-panel rounded-2xl p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold text-white flex items-center gap-2">
                  <Settings2 size={20} className="text-primary" />
                  Configuración de Envío
                </h3>
                <div className="flex items-center gap-3">
                  {savingConfig && <span className="text-xs text-primary animate-pulse">Guardando...</span>}
                  <button onClick={() => setShowConfig(false)} className="cursor-pointer text-text-muted hover:text-white text-sm">Cerrar</button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Auto-send toggle */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-white">Envío Automático Mensual</label>
                    <button onClick={() => saveConfig({ ...config, autoSend: !config.autoSend })} className="cursor-pointer">
                      {config.autoSend ? <ToggleRight size={28} className="text-primary" /> : <ToggleLeft size={28} className="text-text-muted" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-text-muted">
                    {config.autoSend ? 'Los reportes se enviarán automáticamente.' : 'Los reportes solo se envían manualmente.'}
                  </p>
                </div>

                {/* Send day */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white flex items-center gap-2">
                    <Calendar size={14} className="text-primary" />
                    Día de envío
                  </label>
                  <select
                    value={config.sendDay}
                    onChange={e => saveConfig({ ...config, sendDay: Number(e.target.value) })}
                    disabled={!config.autoSend}
                    className="w-full cursor-pointer rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary disabled:opacity-50"
                  >
                    <option value={1}>Día 1 del mes</option>
                    <option value={15}>Día 15 del mes</option>
                    <option value={25}>Día 25 del mes</option>
                    <option value={28}>Último día hábil (28)</option>
                  </select>
                  <p className="text-[11px] text-text-muted">Día del mes en que se genera y envía el reporte.</p>
                </div>

                {/* Recipients */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-white flex items-center gap-2">
                    <Mail size={14} className="text-primary" />
                    Destinatarios
                  </label>
                  <div className="space-y-2">
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 hover:bg-surface-hover transition-colors">
                      <input type="checkbox" checked={config.sendToClients} onChange={e => saveConfig({ ...config, sendToClients: e.target.checked })} className="h-4 w-4 cursor-pointer rounded border-border accent-primary" />
                      <span className="text-sm text-white">Enviar al cliente (owner del proyecto)</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 hover:bg-surface-hover transition-colors">
                      <input type="checkbox" checked={config.sendToAdmin} onChange={e => saveConfig({ ...config, sendToAdmin: e.target.checked })} className="h-4 w-4 cursor-pointer rounded border-border accent-primary" />
                      <span className="text-sm text-white">Enviar copia al administrador</span>
                    </label>
                  </div>
                </div>

                {/* Auto-send info */}
                {config.autoSend && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                    <p className="text-sm font-medium text-white">📅 Próximo envío automático</p>
                    <p className="text-xs text-text-muted">
                      {(() => {
                        const now = new Date();
                        let nextDate = new Date(now.getFullYear(), now.getMonth(), config.sendDay);
                        if (nextDate <= now) nextDate = new Date(now.getFullYear(), now.getMonth() + 1, config.sendDay);
                        return nextDate.toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                      })()}
                    </p>
                    <p className="text-[10px] text-text-muted">
                      Nota: El envío automático requiere un cron job o Edge Function programada. Actualmente puedes enviar manualmente.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success/Error toasts */}
      <AnimatePresence>
        {sendSuccess === 'error' && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="rounded-xl border border-danger/20 bg-danger/5 px-5 py-3 text-sm text-danger">
            Error al enviar el reporte. Verifica la configuración de Resend.
          </motion.div>
        )}
        {sendSuccess === 'no-recipients' && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="rounded-xl border border-warning/20 bg-warning/5 px-5 py-3 text-sm text-warning">
            No hay destinatarios configurados. Activa al menos un destinatario en la configuración.
          </motion.div>
        )}
        {sendSuccess && sendSuccess !== 'error' && sendSuccess !== 'no-recipients' && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="rounded-xl border border-success/20 bg-success/5 px-5 py-3 text-sm text-success">
            ✓ Reporte enviado correctamente.
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="glass-panel col-span-1 rounded-2xl p-6 lg:col-span-2">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-white">Resumen Global — {currentMonth}</h3>
            <button onClick={loadReports} className="flex cursor-pointer items-center gap-2 text-xs text-text-muted hover:text-primary transition-colors">
              <RefreshCw size={12} /> Actualizar
            </button>
          </div>
          
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="rounded-xl border border-border bg-surface/50 p-4">
              <div className="flex items-center gap-2 text-text-muted mb-2">
                <CheckCircle2 size={16} className="text-success" />
                <span className="text-xs font-medium uppercase tracking-wider">Uptime Promedio</span>
              </div>
              <p className="font-display text-3xl font-bold text-white">{globalStats.avgUptime}%</p>
            </div>
            <div className="rounded-xl border border-border bg-surface/50 p-4">
              <div className="flex items-center gap-2 text-text-muted mb-2">
                <AlertTriangle size={16} className="text-warning" />
                <span className="text-xs font-medium uppercase tracking-wider">Incidentes Totales</span>
              </div>
              <p className="font-display text-3xl font-bold text-white">{globalStats.totalIncidents}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface/50 p-4">
              <div className="flex items-center gap-2 text-text-muted mb-2">
                <BarChart3 size={16} className="text-primary" />
                <span className="text-xs font-medium uppercase tracking-wider">Actualizaciones</span>
              </div>
              <p className="font-display text-3xl font-bold text-white">{globalStats.totalUpdates}</p>
            </div>
          </div>

          <div className="h-[300px] w-full min-h-[300px]">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--color-text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" stroke="var(--color-text-muted)" fontSize={12} tickLine={false} axisLine={false} domain={[99, 100]} />
                  <YAxis yAxisId="right" orientation="right" stroke="var(--color-text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', borderRadius: '8px' }}
                    itemStyle={{ color: 'var(--color-text-main)' }}
                    cursor={{ fill: 'var(--color-surface-hover)' }}
                    formatter={(value: number, name: string) => [name === 'uptime' ? `${value}%` : value, name === 'uptime' ? 'Uptime' : 'Incidentes']}
                  />
                  <Bar yAxisId="left" dataKey="uptime" fill="var(--color-primary)" radius={[4, 4, 0, 0]} barSize={20} name="uptime" />
                  <Bar yAxisId="right" dataKey="incidents" fill="var(--color-secondary)" radius={[4, 4, 0, 0]} barSize={20} name="incidents" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-text-muted text-sm">Sin datos disponibles</div>
            )}
          </div>
        </div>

        <div className="glass-panel col-span-1 rounded-2xl p-6">
          <h3 className="mb-6 font-display text-lg font-semibold text-white">Informes por Proyecto</h3>
          {filteredReports.length === 0 ? (
            <p className="text-sm text-text-muted">No hay informes para los filtros seleccionados.</p>
          ) : (
            <div className="space-y-4">
              {filteredReports.map((report, index) => (
                <motion.div 
                  key={report.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.08 }}
                  className="group flex flex-col gap-0 rounded-xl border border-border bg-surface/30 overflow-hidden transition-colors hover:bg-surface-hover"
                >
                  {/* Header: nombre + cliente */}
                  <div className="px-4 pt-4 pb-3">
                    <h4 className="font-medium text-white truncate">{report.name}</h4>
                    <p className="text-xs text-text-muted mt-0.5">{report.ownerName} — {currentMonth}</p>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 px-4 pb-3 border-t border-border pt-3">
                    <div>
                      <p className="text-[10px] uppercase text-text-muted tracking-wider">Uptime</p>
                      <p className="text-sm font-bold text-white">{report.uptime}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-text-muted tracking-wider">Incidentes</p>
                      <p className="text-sm font-bold text-white">{report.incidents}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-text-muted tracking-wider">Updates</p>
                      <p className="text-sm font-bold text-white">{report.updates}</p>
                    </div>
                  </div>

                  {/* Success message */}
                  {(sendSuccess === report.id || sendSuccess === `admin-${report.id}`) && (
                    <div className="px-4 pb-2">
                      <p className="text-xs text-success flex items-center gap-1"><CheckCircle2 size={12} /> Informe enviado correctamente</p>
                    </div>
                  )}

                  {/* Buttons row */}
                  <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-surface/20">
                    <button
                      onClick={() => { setPreviewReport(report); setPreviewTab('email'); }}
                      className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs font-medium text-text-muted hover:text-secondary hover:border-secondary/50 transition-colors"
                    >
                      <Eye size={12} />
                      Vista Previa
                    </button>
                    <button
                      onClick={() => sendReportToAdmin(report)}
                      disabled={sending === `admin-${report.id}`}
                      className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                    >
                      {sending === `admin-${report.id}` ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                      Enviar a Admin
                    </button>
                    <button
                      onClick={() => sendReport(report)}
                      disabled={sending === report.id}
                      className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs font-medium text-text-muted hover:text-primary hover:border-primary/50 transition-colors disabled:opacity-50"
                    >
                      {sending === report.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                      Enviar a Cliente
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      <AnimatePresence>
        {previewReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setPreviewReport(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-white">Vista Previa del Informe</h2>
                  <p className="text-xs text-text-muted">{previewReport.name} — {currentMonth}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => { sendReport(previewReport); setPreviewReport(null); }}
                    className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover shadow-lg shadow-primary/20"
                  >
                    <Send size={14} />
                    Enviar Informe
                  </button>
                  <button onClick={() => setPreviewReport(null)} className="cursor-pointer rounded-lg p-2 text-text-muted hover:text-white hover:bg-surface-hover transition-colors">
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 border-b border-border px-6 py-2 bg-surface/50">
                <button
                  onClick={() => setPreviewTab('email')}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    previewTab === 'email' ? 'bg-primary/10 text-primary' : 'text-text-muted hover:text-white'
                  }`}
                >
                  <Mail size={14} />
                  Email
                </button>
                <button
                  onClick={() => setPreviewTab('pdf')}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    previewTab === 'pdf' ? 'bg-primary/10 text-primary' : 'text-text-muted hover:text-white'
                  }`}
                >
                  <FileText size={14} />
                  PDF
                </button>
              </div>

              {/* Preview Content */}
              <div className="flex-1 overflow-y-auto">
                {previewTab === 'email' ? (
                  <div className="p-6">
                    {/* Email envelope info */}
                    <div className="mb-4 rounded-xl border border-border bg-[#0a0a1a] p-4 space-y-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-text-muted w-16">De:</span>
                        <span className="text-white">LuminaSupport &lt;onboarding@resend.dev&gt;</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-text-muted w-16">Para:</span>
                        <span className="text-white">{previewReport.ownerEmail || 'Sin destinatario'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-text-muted w-16">Asunto:</span>
                        <span className="text-white font-medium">📊 Informe Mensual — {previewReport.name} — {currentMonth}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-text-muted w-16">Adjunto:</span>
                        <span className="text-primary flex items-center gap-1"><FileText size={11} /> Informe-{previewReport.name.replace(/\s+/g, '-')}.pdf</span>
                      </div>
                    </div>

                    {/* Email body preview — matches buildReportHtml */}
                    <div className="rounded-xl overflow-hidden border border-border">
                      <div style={{ fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto', background: '#1a1a2e', color: '#e0e0e0', padding: '32px' }}>
                        {/* Header */}
                        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                          <span style={{ fontSize: '22px', fontWeight: 'bold', color: '#fff' }}>Lumina<span style={{ color: '#a78bfa' }}>Support</span></span>
                          <p style={{ color: '#a78bfa', fontSize: '11px', margin: '2px 0 4px', fontWeight: 500 }}>por Luis Salas Cortés</p>
                          <p style={{ color: '#888', fontSize: '12px', margin: '0' }}>Informe de Mantenimiento</p>
                        </div>

                        {/* Greeting */}
                        <div style={{ marginBottom: '24px' }}>
                          <p style={{ color: '#fff', fontSize: '15px', margin: '0 0 12px', fontWeight: '600' }}>¡Hola {previewReport.ownerName.split(' ')[0]}! 👋</p>
                          <p style={{ color: '#ccc', fontSize: '13px', lineHeight: '1.6', margin: '0' }}>
                            Te compartimos el resumen de <strong style={{ color: '#a78bfa' }}>{previewReport.name}</strong> correspondiente a <strong>{currentMonth}</strong>. Aquí va un vistazo rápido de cómo estuvo todo:
                          </p>
                        </div>

                        {/* KPIs */}
                        <div style={{ marginBottom: '20px' }}>
                          <p style={{ color: '#fff', fontSize: '13px', fontWeight: '600', margin: '0 0 12px' }}>📊 Indicadores Clave</p>
                          <div style={{ display: 'grid', gridTemplateColumns: previewReport.avgResponseTime > 0 ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr', gap: '8px' }}>
                            <div style={{ textAlign: 'center', padding: '16px 8px', background: '#16162a', border: '1px solid #2a2a4a', borderRadius: '10px' }}>
                              <p style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px' }}>Uptime</p>
                              <p style={{ color: getUptimeVerdict(previewReport.uptime).color, fontSize: '22px', fontWeight: 'bold', margin: '0' }}>{previewReport.uptime}%</p>
                            </div>
                            <div style={{ textAlign: 'center', padding: '16px 8px', background: '#16162a', border: '1px solid #2a2a4a', borderRadius: '10px' }}>
                              <p style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px' }}>Incidentes</p>
                              <p style={{ color: previewReport.incidents === 0 ? '#4ade80' : '#fbbf24', fontSize: '22px', fontWeight: 'bold', margin: '0' }}>{previewReport.incidents}</p>
                            </div>
                            <div style={{ textAlign: 'center', padding: '16px 8px', background: '#16162a', border: '1px solid #2a2a4a', borderRadius: '10px' }}>
                              <p style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px' }}>Updates</p>
                              <p style={{ color: '#fff', fontSize: '22px', fontWeight: 'bold', margin: '0' }}>{previewReport.updates}</p>
                            </div>
                            {previewReport.avgResponseTime > 0 && (
                              <div style={{ textAlign: 'center', padding: '16px 8px', background: '#16162a', border: '1px solid #2a2a4a', borderRadius: '10px' }}>
                                <p style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px' }}>Velocidad</p>
                                <p style={{ color: '#38bdf8', fontSize: '22px', fontWeight: 'bold', margin: '0' }}>{previewReport.avgResponseTime}<span style={{ fontSize: '11px', fontWeight: 'normal' }}>ms</span></p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Monthly summary */}
                        <div style={{ background: '#16162a', border: '1px solid #2a2a4a', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
                          <p style={{ color: '#fff', fontSize: '13px', fontWeight: '600', margin: '0 0 12px' }}>📝 Resumen del Mes</p>
                          <p style={{ color: '#ccc', fontSize: '13px', lineHeight: '1.7', margin: '0 0 12px' }}>
                            La disponibilidad de tu sitio fue <strong style={{ color: getUptimeVerdict(previewReport.uptime).color }}>{getUptimeVerdict(previewReport.uptime).text}</strong>, con un uptime del {previewReport.uptime}%.{' '}
                            {getResponseVerdict(previewReport.avgResponseTime)}
                          </p>
                          <p style={{ color: '#ccc', fontSize: '13px', lineHeight: '1.7', margin: '0 0 12px' }}>
                            {previewReport.incidents === 0
                              ? 'No se registraron incidentes este mes. ¡Todo funcionó sin problemas!'
                              : previewReport.incidents === 1
                                ? 'Se detectó 1 incidente que fue gestionado y resuelto oportunamente.'
                                : `Se detectaron ${previewReport.incidents} incidentes que fueron gestionados durante el mes.`}
                          </p>
                          <p style={{ color: '#ccc', fontSize: '13px', lineHeight: '1.7', margin: '0' }}>
                            {previewReport.updates === 0
                              ? 'No hubo actualizaciones de plugins o temas pendientes este mes.'
                              : `Se aplicaron ${previewReport.updates} actualizaciones de plugins y temas para mantener tu sitio seguro y al día.`}
                            {previewReport.pluginsTotal > 0 ? ` Tu sitio tiene ${previewReport.pluginsTotal} plugins/temas que monitoreamos constantemente.` : ''}
                          </p>
                        </div>

                        {/* Status badge */}
                        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                          <span style={{ display: 'inline-block', padding: '8px 20px', borderRadius: '999px', fontSize: '12px', fontWeight: '600', background: getUptimeVerdict(previewReport.uptime).bg, color: getUptimeVerdict(previewReport.uptime).color }}>
                            {getUptimeVerdict(previewReport.uptime).emoji} Estado general: {getUptimeVerdict(previewReport.uptime).text.charAt(0).toUpperCase() + getUptimeVerdict(previewReport.uptime).text.slice(1)}
                          </span>
                        </div>

                        {/* Footer */}
                        <div style={{ textAlign: 'center', paddingTop: '16px', borderTop: '1px solid #2a2a4a' }}>
                          <p style={{ color: '#888', fontSize: '12px', margin: '0 0 4px' }}>¿Tienes dudas? Responde este correo y con gusto te ayudamos.</p>
                          <p style={{ color: '#555', fontSize: '10px', margin: '0' }}>LuminaSupport · Generado el {new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                          <p style={{ color: '#444', fontSize: '10px', margin: '4px 0 0' }}>📎 PDF adjunto con el informe completo</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* PDF Preview */
                  <div className="p-6">
                    <div className="rounded-xl border border-border overflow-hidden shadow-2xl">
                      <div style={{ fontFamily: 'sans-serif', background: '#fff', color: '#1a1a2e', padding: '48px', minHeight: '700px' }}>
                        {/* PDF Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', borderBottom: '3px solid #a78bfa', paddingBottom: '20px' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #a78bfa, #818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Shield size={18} style={{ color: '#fff' }} />
                              </div>
                              <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#1a1a2e' }}>Lumina<span style={{ color: '#a78bfa' }}>Support</span></span>
                            </div>
                            <p style={{ color: '#a78bfa', fontSize: '11px', margin: '2px 0 2px', fontWeight: 500 }}>por Luis Salas Cortés</p>
                            <p style={{ color: '#888', fontSize: '11px', margin: '0' }}>Informe de Mantenimiento Mensual</p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a2e', margin: '0' }}>{currentMonth}</p>
                            <p style={{ color: '#aaa', fontSize: '10px', margin: '4px 0 0' }}>Ref: RPT-{previewReport.id.slice(0, 8).toUpperCase()}</p>
                          </div>
                        </div>

                        {/* Project info box */}
                        <div style={{ background: '#f8f8fc', borderRadius: '12px', padding: '24px', marginBottom: '28px', border: '1px solid #e8e8f0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <p style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a2e', margin: '0' }}>{previewReport.name}</p>
                              <p style={{ color: '#888', fontSize: '12px', margin: '4px 0 0' }}>{previewReport.url}</p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <p style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e', margin: '0' }}>{previewReport.ownerName}</p>
                              <p style={{ color: '#888', fontSize: '11px', margin: '2px 0 0' }}>{previewReport.ownerEmail}</p>
                            </div>
                          </div>
                        </div>

                        {/* Intro */}
                        <p style={{ color: '#555', fontSize: '13px', lineHeight: '1.7', margin: '0 0 24px' }}>
                          Hola {previewReport.ownerName.split(' ')[0]}, te compartimos el resumen de mantenimiento de tu sitio correspondiente a {currentMonth}. A continuación encontrarás los indicadores clave y un resumen de las actividades realizadas.
                        </p>

                        {/* KPI Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '28px' }}>
                          {[
                            { label: 'Disponibilidad', value: `${previewReport.uptime}%`, color: getUptimeVerdict(previewReport.uptime).color === '#4ade80' ? '#16a34a' : getUptimeVerdict(previewReport.uptime).color === '#a78bfa' ? '#7c3aed' : '#d97706' },
                            { label: 'Incidentes', value: `${previewReport.incidents}`, color: previewReport.incidents === 0 ? '#16a34a' : '#d97706' },
                            { label: 'Actualizaciones', value: `${previewReport.updates}`, color: '#7c3aed' },
                            { label: 'Velocidad Prom.', value: previewReport.avgResponseTime > 0 ? `${previewReport.avgResponseTime}ms` : 'N/A', color: '#0284c7' },
                          ].map((kpi, i) => (
                            <div key={i} style={{ textAlign: 'center', padding: '16px 8px', borderRadius: '10px', border: '1px solid #e8e8f0', background: '#fff' }}>
                              <p style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px' }}>{kpi.label}</p>
                              <p style={{ color: kpi.color, fontSize: '26px', fontWeight: '800', margin: '0', lineHeight: '1' }}>{kpi.value}</p>
                            </div>
                          ))}
                        </div>

                        {/* Monthly summary */}
                        <div style={{ marginBottom: '28px' }}>
                          <p style={{ fontSize: '14px', fontWeight: '700', color: '#1a1a2e', margin: '0 0 12px' }}>Resumen del Mes</p>
                          <p style={{ color: '#555', fontSize: '12px', lineHeight: '1.8', margin: '0 0 8px' }}>
                            La disponibilidad del sitio fue {getUptimeVerdict(previewReport.uptime).text}, manteniéndose en un {previewReport.uptime}% durante el período.
                            {previewReport.avgResponseTime > 0 ? ` El tiempo de respuesta promedio fue de ${previewReport.avgResponseTime}ms.` : ''}
                          </p>
                          <p style={{ color: '#555', fontSize: '12px', lineHeight: '1.8', margin: '0 0 8px' }}>
                            {previewReport.incidents === 0
                              ? 'No se registraron incidentes durante este mes. Todo funcionó sin problemas.'
                              : `Se detectaron ${previewReport.incidents} incidentes que fueron gestionados y resueltos durante el mes.`}
                          </p>
                          <p style={{ color: '#555', fontSize: '12px', lineHeight: '1.8', margin: '0' }}>
                            {previewReport.updates === 0
                              ? 'No hubo actualizaciones de plugins o temas pendientes.'
                              : `Se aplicaron ${previewReport.updates} actualizaciones para mantener el sitio seguro y actualizado.`}
                            {previewReport.pluginsTotal > 0 ? ` Se monitorean ${previewReport.pluginsTotal} componentes en total.` : ''}
                          </p>
                        </div>

                        {/* Detail table */}
                        <div style={{ marginBottom: '28px' }}>
                          <p style={{ fontSize: '14px', fontWeight: '700', color: '#1a1a2e', margin: '0 0 12px' }}>Detalle</p>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                              <tr style={{ borderBottom: '2px solid #e8e8f0' }}>
                                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#888', fontWeight: '600', fontSize: '10px', textTransform: 'uppercase' }}>Métrica</th>
                                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#888', fontWeight: '600', fontSize: '10px', textTransform: 'uppercase' }}>Valor</th>
                                <th style={{ padding: '10px 12px', textAlign: 'right', color: '#888', fontWeight: '600', fontSize: '10px', textTransform: 'uppercase' }}>Estado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[
                                { metric: 'Disponibilidad (Uptime)', value: `${previewReport.uptime}%`, status: getUptimeVerdict(previewReport.uptime).text.charAt(0).toUpperCase() + getUptimeVerdict(previewReport.uptime).text.slice(1), good: previewReport.uptime >= 99 },
                                { metric: 'Incidentes Detectados', value: `${previewReport.incidents}`, status: previewReport.incidents === 0 ? 'Sin incidentes' : 'Gestionados', good: previewReport.incidents === 0 },
                                { metric: 'Actualizaciones Aplicadas', value: `${previewReport.updates}`, status: previewReport.updates > 0 ? 'Completado' : 'Sin pendientes', good: true },
                                { metric: 'Plugins/Temas Monitoreados', value: `${previewReport.pluginsTotal}`, status: previewReport.pluginsTotal > 0 ? 'Activo' : 'N/A', good: true },
                                { metric: 'Velocidad Promedio', value: previewReport.avgResponseTime > 0 ? `${previewReport.avgResponseTime}ms` : 'N/A', status: previewReport.avgResponseTime === 0 ? 'N/A' : previewReport.avgResponseTime < 500 ? 'Rápido' : 'Normal', good: previewReport.avgResponseTime < 1000 },
                                { metric: 'Período', value: currentMonth, status: '', good: true },
                              ].map((row, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #f0f0f5' }}>
                                  <td style={{ padding: '10px 12px', color: '#1a1a2e' }}>{row.metric}</td>
                                  <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '600', color: '#1a1a2e' }}>{row.value}</td>
                                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                    {row.status && (
                                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: '600', background: row.good ? '#dcfce7' : '#fef3c7', color: row.good ? '#16a34a' : '#d97706' }}>{row.status}</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Footer */}
                        <div style={{ borderTop: '2px solid #e8e8f0', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <p style={{ color: '#aaa', fontSize: '10px', margin: '0' }}>Generado por LuminaSupport</p>
                            <p style={{ color: '#ccc', fontSize: '9px', margin: '2px 0 0' }}>{new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ color: '#aaa', fontSize: '10px', margin: '0' }}>Página 1 de 1</p>
                            <p style={{ color: '#ccc', fontSize: '9px', margin: '2px 0 0' }}>Ref: RPT-{previewReport.id.slice(0, 8).toUpperCase()}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Download PDF button */}
                    <div className="mt-4 flex items-center justify-center gap-3">
                      <button
                        onClick={() => {
                          const b64 = buildReportPdf(previewReport);
                          const link = document.createElement('a');
                          link.href = `data:application/pdf;base64,${b64}`;
                          link.download = `Informe-${previewReport.name.replace(/\s+/g, '-')}-${currentMonth.replace(/\s+/g, '-')}.pdf`;
                          link.click();
                        }}
                        className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover transition-colors"
                      >
                        <Download size={14} />
                        Descargar PDF
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
