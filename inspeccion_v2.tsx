import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ClipboardCheck,
  FileText,
  FileSpreadsheet,
  Ruler,
  Signature,
  LineChart,
  Map,
  Compass,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Mountain,
} from "lucide-react";

export const Route = createFileRoute("/inspeccion")({
  head: () => ({
    meta: [
      { title: "Reportes de Inspección — QC Digital" },
      {
        name: "description",
        content: "Módulos de inspección de terreno: checklist, reportes diarios, control DT, avances y firmas digitales.",
      },
    ],
  }),
  component: Inspeccion,
});

const REPORTS_BASE = "https://reportes.qcdigital.cl/";

const reports = [
  { icon: ClipboardCheck, title: "Checklist Camioneta", desc: "Verificación pre-uso e inicio de turno.", file: "checklist-camioneta.html" },
  { icon: FileText, title: "Reporte Diario", desc: "Registro consolidado de actividades del día.", file: "reporte-diario.html" },
  { icon: FileSpreadsheet, title: "Reporte Control DT", desc: "Control DT y listado de seguimiento.", file: "reporte-dt-index.html" },
  { icon: Ruler, title: "Procesos Constructivos", desc: "Seguimiento técnico de obra en avance.", file: "informe-procesos-constructivos.html" },
  { icon: Signature, title: "Firmas Digitales", desc: "Registro de charlas, reuniones y asistencia.", file: "listado-firmas-digitales.html" },
  { icon: LineChart, title: "Adherencia Programa Semanal", desc: "Cumplimiento del programa DT.", file: "reporte-programa-semanal.html" },
  { icon: Map, title: "Reporte Gerencial de Avance", desc: "Caminatas, tronaduras y mensuras.", file: "caminata-avance-index.html" },
  { icon: Compass, title: "Avance Caminado IC Minería", desc: "Trazado y avance sobre plano de mina.", file: "ic-mi-plano-index.html" },
  { icon: RefreshCw, title: "Cambio de Turno General", desc: "Traspaso de información entre turnos.", file: "cambio-turno-general.html" },
];

function Inspeccion() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-[var(--gradient-brand)] shadow-[var(--shadow-brand)]">
              <Mountain className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <div className="leading-tight">
              <div className="font-display text-lg font-bold tracking-tight">QC Digital</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Reportes de Inspección</div>
            </div>
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface/60 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-elevated"
          >
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link>
        </div>
      </header>

      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-12">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Módulos activos</div>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-4xl">
              Reportes de Inspección
            </h1>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              9 módulos en producción. Cada tarjeta abre el reporte correspondiente en la PWA de terreno.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {reports.map((r) => (
              <a
                key={r.title}
                href={REPORTS_BASE + r.file}
                target="_blank"
                rel="noreferrer"
                className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 transition hover:-translate-y-1 hover:border-primary/50 hover:shadow-[var(--shadow-brand)]"
              >
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent opacity-0 transition group-hover:opacity-100" />
                <div className="mb-5 grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                  <r.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold leading-snug">{r.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{r.desc}</p>
                <div className="mt-6 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary opacity-0 transition group-hover:opacity-100">
                  Abrir módulo <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 bg-background py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground md:flex-row">
          <div className="flex items-center gap-2.5">
            <div className="grid h-7 w-7 place-items-center rounded bg-[var(--gradient-brand)]">
              <Mountain className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <span className="font-display font-semibold text-foreground">QC Digital</span>
            <span>· qcdigital.cl</span>
          </div>
          <div>© {new Date().getFullYear()} QC Digital · Mining Quality Suite</div>
        </div>
      </footer>
    </div>
  );
}
