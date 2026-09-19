const setText = (id, value) => {
  const node = document.getElementById(id);
  if (node) node.textContent = String(value);
};

async function readJson(path) {
  const response = await fetch(path, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.json();
}

try {
  const [users, protocol] = await Promise.all([readJson("/users/stats"), readJson("/usage")]);

  setText("registered-users", Number(users.registered_users ?? 0));
  setText("consented-users", Number(users.consented_users ?? 0));
  setText("wallet-linked-users", Number(users.wallet_linked_users ?? 0));
  setText("protocol-participants", Number(users.protocol_participants ?? 0));
  setText("missions-created", Number(protocol.missions_created ?? 0));
  setText("finalized-hops", Number(protocol.finalized_hops ?? 0));

  const state = document.getElementById("usage-state");
  if (state) state.textContent = "Live production aggregates loaded. No personally identifying records are exposed.";
  setText("usage-updated", `Loaded from production at ${new Date().toISOString()}.`);
} catch (error) {
  const state = document.getElementById("usage-state");
  if (state) state.textContent = error instanceof Error ? `Could not load live evidence: ${error.message}` : "Could not load live evidence.";
}
