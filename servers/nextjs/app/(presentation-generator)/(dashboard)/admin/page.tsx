import { requireAdminSession } from "@/utils/serverAuth";
import AdminPanel from "./AdminPanel";

export const metadata = {
  title: "Admin | GSlide",
};

export default async function AdminPage() {
  await requireAdminSession();
  return <AdminPanel />;
}
