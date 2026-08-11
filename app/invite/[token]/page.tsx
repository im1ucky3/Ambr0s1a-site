import AuthForm from "../../auth/AuthForm";
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AuthForm mode="invite" token={token}/>;
}
