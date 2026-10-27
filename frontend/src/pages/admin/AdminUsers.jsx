import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../hooks/useAuth.jsx";
import { api } from "../../services/api.js";
import Alert from "../../components/common/Alert.jsx";
import Badge from "../../components/common/Badge.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import EmptyState from "../../components/common/EmptyState.jsx";
import Input from "../../components/common/Input.jsx";
import LoadingState from "../../components/common/LoadingState.jsx";

const ROLE_LABELS = {
  ADMIN: "Quản trị",
  HOST: "Chủ homestay",
  VEHICLE_OWNER: "Chủ xe",
  CUSTOMER: "Khách hàng",
};

export default function AdminUsers() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      setError("");
      setUsers(await api(`/admin/users/${search ? `?q=${encodeURIComponent(search)}` : ""}`));
    } catch (err) {
      setError(err.message);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  async function toggle(userRow) {
    setBusy(userRow.id);
    setError("");
    try {
      await api(`/admin/users/${userRow.id}/status/`, {
        method: "PATCH",
        body: { is_active: !userRow.is_active },
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-emerald-800">QUẢN LÝ TÀI KHOẢN</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Người dùng</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Tra cứu tài khoản, vai trò và trạng thái hoạt động.</p>
      </div>
      <Alert>{error}</Alert>
      <Card className="p-4 sm:p-5">
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); }}>
          <Input
            id="user-search"
            className="flex-1"
            label="Tìm người dùng"
            inputClassName="text-sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm tên đăng nhập hoặc email"
          />
          <Button type="submit">Tìm người dùng</Button>
          {search && <Button variant="secondary" onClick={() => { setQuery(""); setSearch(""); }}>Xóa lọc</Button>}
        </form>
      </Card>

      {users === null ? <LoadingState /> : users.length === 0 ? (
        <EmptyState title="Không tìm thấy người dùng" description="Thử từ khóa khác hoặc xóa bộ lọc tìm kiếm." />
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <p className="text-sm font-semibold text-slate-800">{users.length} tài khoản{users.length === 250 ? " gần nhất" : ""}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Tài khoản</th>
                  <th className="px-5 py-3 font-semibold">Vai trò</th>
                  <th className="px-5 py-3 font-semibold">Ngày tham gia</th>
                  <th className="px-5 py-3 font-semibold">Trạng thái</th>
                  <th className="px-5 py-3 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{row.username}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.email}</p>
                    </td>
                    <td className="px-5 py-4"><Badge tone={row.role === "ADMIN" ? "violet" : "neutral"}>{ROLE_LABELS[row.role] ?? row.role}</Badge></td>
                    <td className="px-5 py-4 text-slate-600">{new Date(row.date_joined).toLocaleDateString("vi-VN")}</td>
                    <td className="px-5 py-4"><Badge tone={row.is_active ? "success" : "danger"}>{row.is_active ? "Đang hoạt động" : "Đã khóa"}</Badge></td>
                    <td className="px-5 py-4 text-right">
                      <Button
                        variant={row.is_active ? "danger" : "secondary"}
                        className="min-h-9 px-3 py-1.5"
                        disabled={busy === row.id || row.username === user?.username}
                        onClick={() => toggle(row)}
                        title={row.username === user?.username ? "Không thể tự khóa tài khoản hiện tại" : undefined}
                      >
                        {busy === row.id ? "Đang lưu…" : row.is_active ? "Khóa tài khoản" : "Mở khóa"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
