import { Search } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <form onSubmit={handleSearch} className="w-full max-w-lg">
      <div className="flex items-center bg-yt-surface border border-yt-border rounded-full px-4 py-1.5 gap-2 focus-within:border-yt-muted">
        <Search size={14} className="text-yt-muted flex-shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search songs, artists…"
          className="bg-transparent text-sm text-yt-text placeholder-yt-muted outline-none w-full"
        />
      </div>
    </form>
  );
}
