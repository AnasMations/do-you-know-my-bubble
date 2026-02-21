"use client";

interface NameEntryFormProps {
  name: string;
  onNameChange: (name: string) => void;
  onSubmit: () => void;
}

export function NameEntryForm({
  name,
  onNameChange,
  onSubmit,
}: NameEntryFormProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) onSubmit();
  };

  return (
    <div className="flex flex-col min-h-screen items-center justify-center p-8 bg-sky-50">
      <div className="max-w-md w-full">
        <h1 className="text-4xl font-bold mb-4 text-center text-sky-900">
          Enter Your Name
        </h1>
        <p className="text-lg mb-8 text-center text-sky-600">
          Start building your network bubble
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Your name"
            className="w-full px-4 py-3 text-lg border-2 border-sky-200 rounded-lg focus:outline-none focus:border-sky-400 bg-white text-sky-900 placeholder:text-sky-300"
            autoFocus
          />
          <button
            type="submit"
            className="w-full px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-lg transition-colors"
          >
            Create My Bubble
          </button>
        </form>
      </div>
    </div>
  );
}
