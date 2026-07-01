@tailwind base;
@tailwind components;
@tailwind utilities;

/* ── Land Signal dark survey-console theme ── */
:root{
  --ink:#0B1416; --ink2:#0F1B1E; --surface:#142528; --surface2:#1A2F33;
  --line:#1E3538; --line2:#2C4A4F;
  --amber:#E8B04B; --cyan:#6FD6E0; --lime:#B6F03C; --muted:#7E938F;
  --text:#E7EEEC; --passed:#3A4F4B; --danger:#E8765B;
}
body{
  background:var(--ink); color:var(--text);
  font-family:Inter,ui-sans-serif,system-ui,sans-serif;
  background-image:
    repeating-linear-gradient(0deg,rgba(108,170,160,.022) 0 1px,transparent 1px 42px),
    repeating-linear-gradient(90deg,rgba(108,170,160,.022) 0 1px,transparent 1px 42px);
}
.mono{font-family:"JetBrains Mono",ui-monospace,monospace}
.display{font-family:"Space Grotesk",Inter,sans-serif}

.card{ @apply rounded-2xl; background:var(--surface); border:1px solid var(--line); }
.btn{ @apply inline-flex items-center justify-center rounded-xl px-4 py-2 font-medium; border:1px solid var(--line2); background:var(--surface); color:var(--text); transition:.12s; }
.btn:hover{ border-color:var(--cyan); color:var(--cyan); }
.btn-primary{ background:var(--cyan); color:var(--ink); border-color:var(--cyan); }
.btn-primary:hover{ filter:brightness(1.08); color:var(--ink); }
.input{ @apply w-full rounded-xl px-3 py-2; background:var(--ink2); border:1px solid var(--line2); color:var(--text); }
.input:focus{ outline:none; border-color:var(--cyan); }
.label{ @apply text-sm font-medium; color:var(--muted); }

table thead{ background:var(--ink2)!important; }
table th{ color:var(--muted)!important; font-family:"JetBrains Mono",monospace; font-size:11px; letter-spacing:.08em; text-transform:uppercase; }
table tr{ border-color:var(--line)!important; }
a{ color:var(--cyan); }

/* status pills */
.pill{ font-family:"JetBrains Mono",monospace; font-size:10px; letter-spacing:.1em; text-transform:uppercase; padding:3px 8px; border-radius:5px; }
.pill-new{ background:var(--lime); color:var(--ink); }
.pill-pre{ background:var(--amber); color:var(--ink); }
.pill-good{ background:var(--cyan); color:var(--ink); }

::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-thumb{background:var(--line2);border-radius:3px}

.del-row{ background:none; border:none; color:var(--muted); font-size:18px; line-height:1; cursor:pointer; padding:0 6px; }
.del-row:hover{ color:var(--danger); }
.btn.danger{ border-color:var(--danger); color:var(--danger); background:none; }
.btn.danger:hover{ background:var(--danger); color:var(--ink); }
