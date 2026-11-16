import { Editor } from "./Editor";

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Editor projectId={id} />;
}
