export default function LazarusLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style>{`
        /* Hide root layout components on Lazarus page */
        [class*="InitializationTracer"],
        [class*="initialization"],
        [class*="tracer"],
        .fixed.bottom-4.right-4,
        .fixed.bottom-0.right-0,
        div[style*="position: fixed"][style*="bottom"],
        div[style*="position: fixed"][style*="right"] {
          display: none !important;
        }
      `}</style>
      {children}
    </>
  );
}
