type CliDevicePageProps = {
  searchParams: Promise<{
    user_code?: string;
    status?: string;
    error?: string;
  }>;
};

const errorMessageFor = (value?: string) => {
  switch (value) {
    case "invalid_or_expired":
      return "That CLI device code is invalid or has already expired.";
    case "failed":
      return "We could not approve that CLI device code. Try again.";
    default:
      return null;
  }
};

export default async function CliDevicePage({
  searchParams,
}: CliDevicePageProps) {
  const params = await searchParams;
  const userCode = params.user_code ?? "";
  const status = params.status;
  const error = errorMessageFor(params.error);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          IG Poster CLI
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Approve device login
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Enter the code shown in your terminal to approve the CLI session for
          this workspace account.
        </p>
      </div>

      {status === "approved" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
          <p className="font-medium">Device login approved.</p>
          <p className="mt-2">
            Return to the terminal. The CLI will finish signing in automatically.
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      <form
        action="/api/auth/cli/device/approve"
        method="post"
        className="space-y-4 rounded-3xl border bg-card p-6 shadow-sm"
      >
        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground">Code</span>
          <input
            name="user_code"
            defaultValue={userCode}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="ABCD-EFGH"
            className="w-full rounded-xl border bg-background px-4 py-3 font-mono text-lg uppercase tracking-[0.22em] text-foreground outline-none transition focus:border-foreground"
          />
        </label>

        <button
          type="submit"
          className="inline-flex items-center rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition hover:opacity-90"
        >
          Approve CLI login
        </button>
      </form>
    </main>
  );
}
