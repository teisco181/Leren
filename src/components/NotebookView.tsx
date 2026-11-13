import React, { useState } from 'react';
import {
  BookOpen,
  CheckSquare,
  FileSpreadsheet,
  FileText,
  Presentation,
  Send,
  Sparkles,
  Square,
  Upload,
} from 'lucide-react';
import { StudyItem } from '../types';
import { MarkdownView } from './MarkdownView';

interface NotebookViewProps {
  items: StudyItem[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export const NotebookView: React.FC<NotebookViewProps> = ({ items }) => {
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    items.slice(0, 2).map((i) => i.id)
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSource = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const activeSources = items.filter((i) => selectedIds.includes(i.id));

  const sendPrompt = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || loading) return;
    setError(null);

    if (activeSources.length === 0) {
      setError('Vink links eerst minimaal één notitie, PDF of Google Doc aan als actieve bron.');
      return;
    }

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', text: trimmed }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/notebook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sources: activeSources.map((s) => ({
            title: s.title,
            subject: s.subject,
            content: s.content,
          })),
          messages: messages,
          prompt: trimmed,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kon geen antwoord genereren.');
      setMessages([...nextMessages, { role: 'assistant', text: data.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij het stellen van je vraag.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Jouw Studie-Notebook
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
          Vink je notities en PDF&apos;s aan als actieve bronnen. De AI beantwoordt vragen
          uitsluitend op basis van die geselecteerde stof.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Active Sources Picker */}
        <aside className="lg:col-span-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 flex flex-col">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Actieve bronnen ({activeSources.length})
            </h2>
            {items.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setSelectedIds(
                    selectedIds.length === items.length ? [] : items.map((i) => i.id)
                  )
                }
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {selectedIds.length === items.length ? 'Alles uit' : 'Alles aan'}
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
              Upload eerst een PDF of maak een notitie bij &ldquo;Mappen &amp; Bestanden&rdquo;.
            </div>
          ) : (
            <div className="mt-3 space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
              {items.map((item) => {
                const checked = selectedIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleSource(item.id)}
                    className={`w-full p-3 rounded-xl border text-left flex items-start gap-2.5 transition-colors ${
                      checked
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-400 dark:border-indigo-700'
                        : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="mt-0.5 text-indigo-600 dark:text-indigo-400 shrink-0">
                      {checked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-slate-400" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {item.title}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        {item.type === 'note' && <FileText className="w-3 h-3 text-indigo-500" />}
                        {item.type === 'pdf' && <Upload className="w-3 h-3 text-red-500" />}
                        {item.type === 'gdoc' && <FileText className="w-3 h-3 text-blue-500" />}
                        {item.type === 'gsheet' && <FileSpreadsheet className="w-3 h-3 text-emerald-500" />}
                        {item.type === 'gslide' && <Presentation className="w-3 h-3 text-amber-500" />}
                        <span>{item.subject || 'Algemeen'}</span>
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Right: Grounded Chat Panel */}
        <section className="lg:col-span-8 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 flex flex-col min-h-[540px]">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>
                Beantwoordt vragen op basis van {activeSources.length} geselecteerde bron(nen)
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                'Leg het belangrijkste onderwerp stap-voor-stap uit',
                'Maak 3 oefenvragen met antwoorden',
                'Welke kernbegrippen moet ik kennen?',
              ].map((quick) => (
                <button
                  key={quick}
                  type="button"
                  disabled={loading || activeSources.length === 0}
                  onClick={() => sendPrompt(quick)}
                  className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  {quick}
                </button>
              ))}
            </div>
          </div>

          {/* Chat Feed */}
          <div className="flex-1 p-5 space-y-4 overflow-y-auto max-h-[440px]">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-12 space-y-2">
                <BookOpen className="w-8 h-8 text-slate-400" />
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Stel een vraag over jouw studiemateriaal
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
                  Vraag om een stapsgewijze uitleg van moeilijke stof, laat verbanden tussen twee
                  documenten zien of vraag om oefenvragen.
                </p>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <p className="leading-relaxed">{msg.text}</p>
                    ) : (
                      <MarkdownView content={msg.text} />
                    )}
                  </div>
                </div>
              ))
            )}

            {loading && (
              <div className="flex justify-start">
                <div className="px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                  Antwoord opzoeken in geselecteerde bronnen...
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="mx-5 mb-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendPrompt(input);
            }}
            className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2.5"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Stel een vraag op basis van je geselecteerde bronnen..."
              className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Verstuur</span>
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};
