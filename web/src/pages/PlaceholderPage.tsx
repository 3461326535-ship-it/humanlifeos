export default function PlaceholderPage({ title, milestone }: { title: string; milestone: string }) {
  return (
    <div className="mx-auto max-w-4xl card flex flex-col items-center justify-center border-dashed py-24 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-line-soft text-3xl">
        🚧
      </div>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-soft">{milestone} 里程碑上线</p>
      <p className="mt-4 max-w-md text-xs leading-relaxed text-ink-soft">
        当前是 M1 骨架版：今天视图已可用。看板（M2）、双轨日历与计时（M3）、
        项目/统计/战报（M4）将在后续里程碑逐个上线。
      </p>
    </div>
  );
}
