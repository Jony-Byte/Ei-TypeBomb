import { connection } from "next/server";
import Editor from "./Editor";

export default async function Edit({ params }: { params: Promise<{ link: string }> }) {
    await connection();
    const { link } = await params;
    await new Promise(resolve => setTimeout(resolve, 650));
    return <Editor link={link} />;
}
