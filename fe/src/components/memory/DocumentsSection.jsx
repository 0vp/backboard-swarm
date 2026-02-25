function DocumentsSection() {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-white">Documents</h2>
      <div className="rounded border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300 space-y-2">
        <p>
          Backboard documents are scoped to assistants or threads.
        </p>
        <p className="text-zinc-400">
          Open an assistant or thread in the other tabs to view upload status, file names, and processing results.
        </p>
      </div>
    </section>
  )
}

export default DocumentsSection
