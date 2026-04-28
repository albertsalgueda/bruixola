import { AuthPlaceholder } from '@/components/chrome/auth-placeholder';

export default function LoginPage() {
  return (
    <AuthPlaceholder
      title="Entra a Brúixola"
      body="La versió completa amb properties, deals i pipeline arriba properament. La integració amb Supabase Auth és la propera fita; mentrestant, la vista pública del territori és accessible a /cop sense login."
    />
  );
}
