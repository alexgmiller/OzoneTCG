import { LoginForm } from "@/components/login-form";

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </div>
  );
}
