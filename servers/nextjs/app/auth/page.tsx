import AuthGate from "@/components/Auth/AuthGate";
import { isAuthDisabled } from "@/utils/auth";
import { getServerAuthStatus } from "@/utils/serverAuth";
import { redirect } from "next/navigation";

const AuthPage = async () => {
  if (isAuthDisabled()) {
    redirect("/dashboard");
  }

  const status = await getServerAuthStatus();
  if (status.configured && status.authenticated) {
    redirect("/dashboard");
  }

  return <AuthGate />;
};

export default AuthPage;
