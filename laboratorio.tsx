import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FlaskConical,
  ArrowLeft,
  Mountain,
  FileCheck2,
  Ruler,
  ClipboardList,
  Gauge,
} from "lucide-react";

export const Route = createFileRoute("/laboratorio")({
  head: () => ({
    meta: [
      { title: "Laboratorio — QC Digital (Próximamente)" },
      {
        name: "description",
        content: "Módulo de certificación de laboratorio: ensayos, cumplimiento y control por labor. En desarrollo.",
      },
    ],
  }),
  component: Laboratorio,
});

const alcance = [
  {
    icon: FileCheck2,
    title: "Digitalización de informes",
    desc: "Los informes de ensayo que hoy se generan a mano pasan a formato digital, con respaldo y trazabilidad por turno.",
  },
  {
    icon: Gauge,
    title: "Cumple / No cumple",
    desc: "Cada ensayo se valida contra los parámetros de aceptación de los planos de fortificación, y contra las cantidades del plan de inspección de ensayos.",
  },
  {
    icon: Ruler,
    title: "Control automatizado por labor",
    desc: "Cuando un subsistema agrupa varias calles o frontones, el control se lleva por labor individual, asignando metros de desarrollo según lo definido en el subsistema.",
  },
  {
    icon: ClipboardList,
    title: "Certificados por subsistema",
    desc: "Cuantifica qué certificados de cumplimiento faltan para poder hacer la entrega de cada subsistema a Operaciones.",
  },
];

function Laboratorio() {
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
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Laboratorio</div>
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

      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Próximamente
          </div>
          <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-accent/10 text-accent ring-1 ring-accent/20">
            <FlaskConical className="h-8 w-8" />
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
            Módulo de Laboratorio
          </h1>
          <p className="mt-5 text-lg text-muted-foreground">
            Certificación de la construcción ejecutada día a día y turno a turno.
            Este módulo está en desarrollo — acá va el resumen de lo que viene.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl gap-5 px-6 sm:grid-cols-2">
          {alcance.map((a) => (
            <div
              key={a.title}
              className="rounded-xl border border-border bg-card p-6 transition hover:border-accent/40"
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10 text-accent ring-1 ring-accent/20">
                <a.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold leading-snug">{a.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{a.desc}</p>
            </div>
          ))}
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
