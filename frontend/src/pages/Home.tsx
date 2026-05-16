import { Music2 } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-4">
      <Music2 size={64} className="text-yt-muted opacity-40" />
      <h1 className="text-2xl font-bold text-white">Discord Music</h1>
      <p className="text-yt-muted text-sm max-w-xs">
        Search for a song above to get started, or open a playlist from the sidebar.
        <br /><br />
        Make sure to select your server and join a voice channel first.
      </p>
    </div>
  );
}
