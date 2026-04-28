import { AuthPlaceholder } from '@/components/chrome/auth-placeholder';

export default function PropertiesPage() {
  return (
    <AuthPlaceholder
      title="Propietats · zona privada"
      body="Aquesta secció requereix login. La instal·lació de Supabase Auth és la propera fita. Quan l'autenticació sigui activa hi veuràs les propietats internes del teu equip, sincronitzades amb el pipeline i les deals."
    />
  );
}
