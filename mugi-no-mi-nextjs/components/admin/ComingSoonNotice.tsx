export function ComingSoonNotice({ description }: { description: string }) {
  return (
    <div className="rounded-[4px] border border-line bg-white px-6 py-10 text-center">
      <p className="font-accent text-sm italic tracking-wide text-brand-text">準備中</p>
      <p className="mx-auto mt-3 max-w-md text-[13.5px] leading-relaxed text-kura">{description}</p>
    </div>
  );
}
