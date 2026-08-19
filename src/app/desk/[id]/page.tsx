import { DeskPage } from "@/components/arena/DeskPage";

export default async function Desk({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DeskPage deskId={Number(id)} />;
}
