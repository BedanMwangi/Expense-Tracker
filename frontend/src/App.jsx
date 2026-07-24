import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
    Plus, Trash2, Pencil, Smartphone, RefreshCw, X,
    ArrowUpRight, ArrowDownRight, Wallet, Check, Clock, AlertCircle
} from "lucide-react";

const CATEGORIES = [
    "Food", "Transport", "Rent", "Utilities", "Airtime",
    "Shopping", "Health", "Entertainment", "Salary", "Business", "Other"
];

const fmtKES = (n) =>
    new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 2 }).format(n || 0);

const fmtDate = (d) => {
    if (!d) return "";
    const dt = new Date(d);
    return dt.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
};

const emptyForm = {
    type: "EXPENSE",
    amount: "",
    category: "Food",
    transactionDate: new Date().toISOString().slice(0, 10),
    paymentMethod: "CASH",
};

export default function ExpenseTracker() {
    const [baseUrl, setBaseUrl] = useState("http://localhost:8080");
    const [showSettings, setShowSettings] = useState(false);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [toast, setToast] = useState(null);

    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(emptyForm);

    const [showMpesa, setShowMpesa] = useState(false);
    const [mpesaPhone, setMpesaPhone] = useState("");
    const [mpesaAmount, setMpesaAmount] = useState("");
    const [mpesaRef, setMpesaRef] = useState("");
    const [mpesaBusy, setMpesaBusy] = useState(false);
    const [mpesaResult, setMpesaResult] = useState(null);

    const [filter, setFilter] = useState("ALL");

    const showToast = useCallback((msg, kind = "ok") => {
        setToast({ msg, kind });
        setTimeout(() => setToast(null), 3200);
    }, []);

    const loadTransactions = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${baseUrl}/transactions`);
            if (!res.ok) throw new Error(`Server responded ${res.status}`);
            const data = await res.json();
            setTransactions(Array.isArray(data) ? data : []);
        } catch (e) {
            setError(e.message || "Could not reach the server");
        } finally {
            setLoading(false);
        }
    }, [baseUrl]);

    useEffect(() => { loadTransactions(); }, [loadTransactions]);

    const totals = useMemo(() => {
        let income = 0, expense = 0;
        for (const t of transactions) {
            if (t.type === "INCOME") income += Number(t.amount) || 0;
            else expense += Number(t.amount) || 0;
        }
        return { income, expense, balance: income - expense };
    }, [transactions]);

    const categoryTotals = useMemo(() => {
        const map = {};
        for (const t of transactions) {
            if (t.type !== "EXPENSE") continue;
            map[t.category] = (map[t.category] || 0) + (Number(t.amount) || 0);
        }
        return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
    }, [transactions]);

    const maxCategory = categoryTotals.length ? categoryTotals[0][1] : 1;

    const filtered = useMemo(() => {
        if (filter === "ALL") return transactions;
        return transactions.filter((t) => t.type === filter);
    }, [transactions, filter]);

    const sorted = useMemo(
        () => [...filtered].sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate)),
        [filtered]
    );

    function openAdd() {
        setEditingId(null);
        setForm(emptyForm);
        setShowForm(true);
    }

    function openEdit(t) {
        setEditingId(t.id);
        setForm({
            type: t.type || "EXPENSE",
            amount: t.amount ?? "",
            category: t.category || "Food",
            transactionDate: t.transactionDate || new Date().toISOString().slice(0, 10),
            paymentMethod: t.paymentMethod || "CASH",
        });
        setShowForm(true);
    }

    async function submitForm(e) {
        e.preventDefault();
        if (!form.amount || Number(form.amount) <= 0) {
            showToast("Enter an amount above zero", "error");
            return;
        }
        const payload = { ...form, amount: Number(form.amount) };
        try {
            if (editingId) {
                const res = await fetch(`${baseUrl}/transactions/update/${editingId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) throw new Error("Update failed");
                showToast("Entry updated");
            } else {
                const res = await fetch(`${baseUrl}/transactions/add`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) throw new Error("Save failed");
                showToast("Entry added");
            }
            setShowForm(false);
            loadTransactions();
        } catch (err) {
            showToast(err.message || "Something went wrong", "error");
        }
    }

    async function removeTransaction(id) {
        try {
            const res = await fetch(`${baseUrl}/transactions/delete/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Delete failed");
            setTransactions((prev) => prev.filter((t) => t.id !== id));
            showToast("Entry removed");
        } catch (err) {
            showToast(err.message || "Could not delete", "error");
        }
    }

    async function sendStkPush(e) {
        e.preventDefault();
        if (!mpesaPhone || !mpesaAmount) {
            showToast("Phone and amount are required", "error");
            return;
        }
        setMpesaBusy(true);
        setMpesaResult(null);
        try {
            const params = new URLSearchParams({
                phoneNumber: mpesaPhone,
                amount: mpesaAmount,
                accountReference: mpesaRef || "Expense Tracker",
            });
            const res = await fetch(`${baseUrl}/api/mpesa/stk-push?${params.toString()}`, {
                method: "POST",
            });
            const data = await res.json();
            setMpesaResult(data);
            if (data.status === "success") {
                showToast("STK push sent — check your phone");
                loadTransactions();
            } else {
                showToast(data.message || "STK push failed", "error");
            }
        } catch (err) {
            setMpesaResult({ status: "error", message: err.message });
            showToast("Could not reach the M-Pesa endpoint", "error");
        } finally {
            setMpesaBusy(false);
        }
    }

    return (
        <div style={styles.page}>
            <style>{fontImports}</style>
            <div style={styles.wrap}>

                {/* Header */}
                <header style={styles.header}>
                    <div style={styles.brand}>
                        <div style={styles.brandMark}>KSh</div>
                        <div>
                            <div style={styles.brandTitle}>LEDGER</div>
                            <div style={styles.brandSub}>personal expense tracker</div>
                        </div>
                    </div>
                    <div style={styles.headerActions}>
                        <button style={styles.iconBtn} onClick={loadTransactions} title="Refresh">
                            <RefreshCw size={16} className={loading ? "spin" : ""} />
                        </button>
                        <button style={styles.ghostBtn} onClick={() => setShowSettings((s) => !s)}>
                            server
                        </button>
                    </div>
                </header>

                {showSettings && (
                    <div style={styles.settingsBar}>
                        <label style={styles.settingsLabel}>API base URL</label>
                        <input
                            style={styles.settingsInput}
                            value={baseUrl}
                            onChange={(e) => setBaseUrl(e.target.value)}
                            placeholder="http://localhost:8080"
                        />
                        <button style={styles.settingsGo} onClick={loadTransactions}>connect</button>
                    </div>
                )}

                {error && (
                    <div style={styles.errorBar}>
                        <AlertCircle size={15} />
                        <span>{error} — is the Spring Boot server running at {baseUrl}?</span>
                    </div>
                )}

                {/* Receipt summary */}
                <div style={styles.receipt}>
                    <div style={styles.perfTop} />
                    <div style={styles.receiptInner}>
                        <div style={styles.receiptTitle}>STATEMENT SUMMARY</div>
                        <div style={styles.receiptDate}>{new Date().toLocaleDateString("en-KE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</div>
                        <div style={styles.dashDivider} />

                        <div style={styles.summaryRow}>
                            <span style={styles.summaryLabel}>TOTAL BALANCE</span>
                            <span style={{ ...styles.summaryValue, color: totals.balance >= 0 ? "#00A651" : "#FF6B4A" }}>
                {fmtKES(totals.balance)}
              </span>
                        </div>
                        <div style={styles.dashDivider} />
                        <div style={styles.summaryPair}>
                            <div style={styles.summaryPairItem}>
                                <div style={styles.summaryPairLabel}><ArrowUpRight size={13} color="#00A651" /> INCOME</div>
                                <div style={{ ...styles.summaryPairValue, color: "#00A651" }}>{fmtKES(totals.income)}</div>
                            </div>
                            <div style={styles.summaryPairItem}>
                                <div style={styles.summaryPairLabel}><ArrowDownRight size={13} color="#FF6B4A" /> EXPENSE</div>
                                <div style={{ ...styles.summaryPairValue, color: "#FF6B4A" }}>{fmtKES(totals.expense)}</div>
                            </div>
                        </div>

                        {categoryTotals.length > 0 && (
                            <>
                                <div style={styles.dashDivider} />
                                <div style={styles.summaryLabel}>TOP EXPENSE CATEGORIES</div>
                                <div style={{ marginTop: 10 }}>
                                    {categoryTotals.map(([cat, amt]) => (
                                        <div key={cat} style={styles.barRow}>
                                            <span style={styles.barLabel}>{cat}</span>
                                            <div style={styles.barTrack}>
                                                <div style={{ ...styles.barFill, width: `${(amt / maxCategory) * 100}%` }} />
                                            </div>
                                            <span style={styles.barValue}>{fmtKES(amt)}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                    <div style={styles.perfBottom} />
                </div>

                {/* Actions */}
                <div style={styles.actionRow}>
                    <button style={styles.primaryBtn} onClick={openAdd}>
                        <Plus size={16} /> Add entry
                    </button>
                    <button style={styles.mpesaBtn} onClick={() => { setShowMpesa(true); setMpesaResult(null); }}>
                        <Smartphone size={16} /> Pay with M-Pesa
                    </button>
                    <div style={styles.filterGroup}>
                        {["ALL", "INCOME", "EXPENSE"].map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                style={{ ...styles.filterBtn, ...(filter === f ? styles.filterBtnActive : {}) }}
                            >
                                {f === "ALL" ? "All" : f === "INCOME" ? "Income" : "Expense"}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Transaction tape */}
                <div style={styles.tapeWrap}>
                    <div style={styles.perfTop} />
                    <div style={styles.tapeInner}>
                        {loading && transactions.length === 0 ? (
                            <div style={styles.emptyState}>Loading entries…</div>
                        ) : sorted.length === 0 ? (
                            <div style={styles.emptyState}>
                                <Wallet size={22} color="#5C6B62" />
                                <div style={{ marginTop: 8 }}>No entries yet — record your first transaction.</div>
                            </div>
                        ) : (
                            sorted.map((t, i) => (
                                <div key={t.id ?? i} style={styles.txRow}>
                                    <div style={styles.txLeft}>
                                        <div style={{
                                            ...styles.txDot,
                                            background: t.type === "INCOME" ? "#00A65122" : "#FF6B4A22",
                                            color: t.type === "INCOME" ? "#00A651" : "#FF6B4A",
                                        }}>
                                            {t.type === "INCOME" ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                        </div>
                                        <div>
                                            <div style={styles.txCategory}>{t.category || "Uncategorised"}</div>
                                            <div style={styles.txMeta}>
                                                {fmtDate(t.transactionDate)} · {t.paymentMethod || "—"}
                                                {t.status && t.paymentMethod === "MPESA" && (
                                                    <span style={{
                                                        ...styles.statusPill,
                                                        color: t.status === "COMPLETED" ? "#00A651" : t.status === "FAILED" ? "#FF6B4A" : "#FFB627",
                                                        borderColor: t.status === "COMPLETED" ? "#00A65155" : t.status === "FAILED" ? "#FF6B4A55" : "#FFB62755",
                                                    }}>
                            {t.status === "COMPLETED" ? <Check size={10} /> : t.status === "PENDING" ? <Clock size={10} /> : <X size={10} />}
                                                        {t.status}
                          </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={styles.txRight}>
                    <span style={{ ...styles.txAmount, color: t.type === "INCOME" ? "#00A651" : "#FF6B4A" }}>
                      {t.type === "INCOME" ? "+" : "–"}{fmtKES(t.amount)}
                    </span>
                                        <button style={styles.rowIconBtn} onClick={() => openEdit(t)} title="Edit">
                                            <Pencil size={13} />
                                        </button>
                                        <button style={styles.rowIconBtn} onClick={() => removeTransaction(t.id)} title="Delete">
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    <div style={styles.perfBottom} />
                </div>
            </div>

            {/* Add / edit modal */}
            {showForm && (
                <div style={styles.overlay} onClick={() => setShowForm(false)}>
                    <form style={styles.modal} onClick={(e) => e.stopPropagation()} onSubmit={submitForm}>
                        <div style={styles.modalHead}>
                            <span>{editingId ? "Edit entry" : "New entry"}</span>
                            <button type="button" style={styles.iconBtn} onClick={() => setShowForm(false)}><X size={16} /></button>
                        </div>

                        <div style={styles.typeToggle}>
                            {["EXPENSE", "INCOME"].map((tp) => (
                                <button
                                    type="button"
                                    key={tp}
                                    onClick={() => setForm((f) => ({ ...f, type: tp }))}
                                    style={{
                                        ...styles.typeToggleBtn,
                                        ...(form.type === tp
                                            ? { background: tp === "EXPENSE" ? "#FF6B4A" : "#00A651", color: "#0B0E0C" }
                                            : {}),
                                    }}
                                >
                                    {tp === "EXPENSE" ? "Expense" : "Income"}
                                </button>
                            ))}
                        </div>

                        <label style={styles.fieldLabel}>Amount (KES)</label>
                        <input
                            style={styles.input}
                            type="number" min="0" step="0.01" required
                            value={form.amount}
                            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                            placeholder="0.00"
                        />

                        <label style={styles.fieldLabel}>Category</label>
                        <select
                            style={styles.input}
                            value={form.category}
                            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                        >
                            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>

                        <label style={styles.fieldLabel}>Date</label>
                        <input
                            style={styles.input}
                            type="date"
                            value={form.transactionDate}
                            onChange={(e) => setForm((f) => ({ ...f, transactionDate: e.target.value }))}
                        />

                        <label style={styles.fieldLabel}>Payment method</label>
                        <select
                            style={styles.input}
                            value={form.paymentMethod}
                            onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                        >
                            <option value="CASH">Cash</option>
                            <option value="MPESA">M-Pesa</option>
                            <option value="CARD">Card</option>
                            <option value="BANK">Bank</option>
                        </select>

                        <button type="submit" style={styles.primaryBtn}>
                            {editingId ? "Save changes" : "Add entry"}
                        </button>
                    </form>
                </div>
            )}

            {/* M-Pesa modal */}
            {showMpesa && (
                <div style={styles.overlay} onClick={() => setShowMpesa(false)}>
                    <form style={styles.modal} onClick={(e) => e.stopPropagation()} onSubmit={sendStkPush}>
                        <div style={styles.modalHead}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Smartphone size={16} color="#00A651" /> M-Pesa STK push
              </span>
                            <button type="button" style={styles.iconBtn} onClick={() => setShowMpesa(false)}><X size={16} /></button>
                        </div>

                        <label style={styles.fieldLabel}>Phone number</label>
                        <input
                            style={styles.input}
                            value={mpesaPhone}
                            onChange={(e) => setMpesaPhone(e.target.value)}
                            placeholder="0712345678"
                            required
                        />

                        <label style={styles.fieldLabel}>Amount (KES)</label>
                        <input
                            style={styles.input}
                            type="number" min="1" step="1"
                            value={mpesaAmount}
                            onChange={(e) => setMpesaAmount(e.target.value)}
                            placeholder="500"
                            required
                        />

                        <label style={styles.fieldLabel}>Reference (optional)</label>
                        <input
                            style={styles.input}
                            value={mpesaRef}
                            onChange={(e) => setMpesaRef(e.target.value)}
                            placeholder="Expense Tracker"
                        />

                        <button type="submit" style={styles.mpesaBtn} disabled={mpesaBusy}>
                            {mpesaBusy ? "Sending prompt…" : "Send STK push"}
                        </button>

                        {mpesaResult && (
                            <div style={{
                                ...styles.mpesaResult,
                                borderColor: mpesaResult.status === "success" ? "#00A65155" : "#FF6B4A55",
                                color: mpesaResult.status === "success" ? "#00A651" : "#FF6B4A",
                            }}>
                                {mpesaResult.message || (mpesaResult.status === "success" ? "Sent." : "Failed.")}
                            </div>
                        )}
                    </form>
                </div>
            )}

            {toast && (
                <div style={{
                    ...styles.toast,
                    borderColor: toast.kind === "error" ? "#FF6B4A55" : "#00A65155",
                    color: toast.kind === "error" ? "#FF6B4A" : "#00A651",
                }}>
                    {toast.kind === "error" ? <AlertCircle size={14} /> : <Check size={14} />}
                    {toast.msg}
                </div>
            )}

            <style>{`
        .spin { animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus, select:focus, button:focus-visible {
          outline: 2px solid #00A651;
          outline-offset: 1px;
        }
        @media (prefers-reduced-motion: reduce) {
          .spin { animation: none; }
        }
      `}</style>
        </div>
    );
}

const fontImports = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');
`;

const zigzagMask =
    "repeating-linear-gradient(-45deg, transparent 0 5px, #0B0E0C 5px 10px)";

const styles = {
    page: {
        minHeight: "100vh",
        background: "#0B0E0C",
        color: "#EDEAE1",
        fontFamily: "'Inter', sans-serif",
        padding: "32px 16px 80px",
        boxSizing: "border-box",
    },
    wrap: { maxWidth: 620, margin: "0 auto" },

    header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
    brand: { display: "flex", alignItems: "center", gap: 12 },
    brandMark: {
        width: 40, height: 40, borderRadius: 8, background: "#00A651", color: "#0B0E0C",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 12,
    },
    brandTitle: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 20, letterSpacing: 1 },
    brandSub: { fontSize: 11, color: "#7C8A80", letterSpacing: 0.5, textTransform: "uppercase" },
    headerActions: { display: "flex", gap: 8 },
    iconBtn: {
        width: 32, height: 32, borderRadius: 8, border: "1px solid #23302A", background: "#131A16",
        color: "#EDEAE1", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
    },
    ghostBtn: {
        padding: "0 12px", height: 32, borderRadius: 8, border: "1px solid #23302A", background: "transparent",
        color: "#7C8A80", fontSize: 12, cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace",
    },

    settingsBar: {
        display: "flex", gap: 8, alignItems: "center", background: "#131A16", border: "1px solid #23302A",
        borderRadius: 10, padding: 10, marginBottom: 16,
    },
    settingsLabel: { fontSize: 11, color: "#7C8A80", whiteSpace: "nowrap" },
    settingsInput: {
        flex: 1, background: "#0B0E0C", border: "1px solid #23302A", borderRadius: 6, padding: "6px 10px",
        color: "#EDEAE1", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
    },
    settingsGo: {
        background: "#00A651", color: "#0B0E0C", border: "none", borderRadius: 6, padding: "6px 12px",
        fontWeight: 600, fontSize: 12, cursor: "pointer",
    },

    errorBar: {
        display: "flex", alignItems: "center", gap: 8, background: "#2A1712", border: "1px solid #FF6B4A44",
        color: "#FF9E86", padding: "10px 12px", borderRadius: 10, fontSize: 12.5, marginBottom: 16,
    },

    receipt: { marginBottom: 20 },
    receiptInner: {
        background: "#EDEAE1", color: "#14201A", padding: "22px 22px 18px",
    },
    perfTop: { height: 10, background: zigzagMask, backgroundSize: "14px 10px" },
    perfBottom: { height: 10, background: zigzagMask, backgroundSize: "14px 10px", transform: "rotate(180deg)" },
    receiptTitle: {
        fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 12, letterSpacing: 2,
    },
    receiptDate: { fontSize: 11, color: "#5C6B62", marginTop: 2, fontFamily: "'IBM Plex Mono', monospace" },
    dashDivider: { borderTop: "1.5px dashed #B9B3A0", margin: "12px 0" },
    summaryRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
    summaryLabel: { fontSize: 11, letterSpacing: 1.5, color: "#5C6B62", fontFamily: "'IBM Plex Mono', monospace" },
    summaryValue: { fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 26 },
    summaryPair: { display: "flex", gap: 24 },
    summaryPairItem: { flex: 1 },
    summaryPairLabel: {
        display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, letterSpacing: 1,
        color: "#5C6B62", fontFamily: "'IBM Plex Mono', monospace",
    },
    summaryPairValue: { fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 16, marginTop: 3 },

    barRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 7 },
    barLabel: { fontSize: 11.5, width: 90, flexShrink: 0, color: "#3A453E" },
    barTrack: { flex: 1, height: 6, background: "#DCD7C6", borderRadius: 3, overflow: "hidden" },
    barFill: { height: "100%", background: "#FF6B4A", borderRadius: 3 },
    barValue: {
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, width: 78, textAlign: "right", flexShrink: 0,
        color: "#3A453E",
    },

    actionRow: { display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18, alignItems: "center" },
    primaryBtn: {
        display: "flex", alignItems: "center", gap: 6, background: "#EDEAE1", color: "#14201A", border: "none",
        borderRadius: 9, padding: "10px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer", width: "auto",
    },
    mpesaBtn: {
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#00A651",
        color: "#0B0E0C", border: "none", borderRadius: 9, padding: "10px 16px", fontWeight: 600, fontSize: 13,
        cursor: "pointer", width: "auto",
    },
    filterGroup: { marginLeft: "auto", display: "flex", gap: 4, background: "#131A16", padding: 3, borderRadius: 9, border: "1px solid #23302A" },
    filterBtn: {
        border: "none", background: "transparent", color: "#7C8A80", fontSize: 12, padding: "6px 10px",
        borderRadius: 6, cursor: "pointer",
    },
    filterBtnActive: { background: "#23302A", color: "#EDEAE1" },

    tapeWrap: {},
    tapeInner: { background: "#131A16", border: "1px solid #23302A", borderTop: "none", borderBottom: "none", padding: "4px 18px" },
    emptyState: { textAlign: "center", color: "#7C8A80", fontSize: 13, padding: "36px 0" },

    txRow: {
        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0",
        borderBottom: "1px dashed #23302A",
    },
    txLeft: { display: "flex", alignItems: "center", gap: 12 },
    txDot: { width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" },
    txCategory: { fontSize: 13.5, fontWeight: 500 },
    txMeta: { fontSize: 11, color: "#7C8A80", marginTop: 2, display: "flex", alignItems: "center", gap: 6 },
    statusPill: {
        display: "inline-flex", alignItems: "center", gap: 3, border: "1px solid", borderRadius: 20,
        padding: "1px 6px", fontSize: 9.5, fontFamily: "'IBM Plex Mono', monospace",
    },
    txRight: { display: "flex", alignItems: "center", gap: 6 },
    txAmount: { fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 13.5, minWidth: 92, textAlign: "right" },
    rowIconBtn: {
        width: 26, height: 26, border: "1px solid #23302A", background: "transparent", color: "#7C8A80",
        borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
    },

    overlay: {
        position: "fixed", inset: 0, background: "#0B0E0Ccc", display: "flex", alignItems: "center",
        justifyContent: "center", padding: 16, zIndex: 50,
    },
    modal: {
        background: "#131A16", border: "1px solid #23302A", borderRadius: 14, padding: 22, width: "100%",
        maxWidth: 380, display: "flex", flexDirection: "column", gap: 4,
    },
    modalHead: {
        display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10,
        fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15,
    },
    typeToggle: { display: "flex", gap: 8, marginBottom: 8 },
    typeToggleBtn: {
        flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid #23302A", background: "transparent",
        color: "#EDEAE1", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
    },
    fieldLabel: { fontSize: 11, color: "#7C8A80", marginTop: 8, marginBottom: 4, letterSpacing: 0.3 },
    input: {
        background: "#0B0E0C", border: "1px solid #23302A", borderRadius: 8, padding: "9px 10px",
        color: "#EDEAE1", fontSize: 13, fontFamily: "'Inter', sans-serif",
    },
    mpesaResult: {
        marginTop: 10, border: "1px solid", borderRadius: 8, padding: "8px 10px", fontSize: 12,
    },

    toast: {
        position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#131A16",
        border: "1px solid", borderRadius: 10, padding: "10px 16px", fontSize: 12.5, display: "flex",
        alignItems: "center", gap: 8, zIndex: 60,
    },
};
