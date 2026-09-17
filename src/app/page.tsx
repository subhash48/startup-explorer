import Explorer from "@/components/explorer";
export const dynamic = "force-dynamic";
export default function Home() {
  return <Explorer sampleMode={!process.env.NVIDIA_API_KEY?.trim()} />;
}
