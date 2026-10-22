"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronsUpDown, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ComboOption = {
  value: string;
  label: string;
  description?: string;
  hint?: ReactNode; // right-aligned secondary text (e.g. code, country)
  disabled?: boolean;
};

/**
 * Searchable single-select. Two modes:
 *  - client filtering (default): pass all `options`;
 *  - server search: pass `onSearchChange` and the already-filtered `options`
 *    (cmdk filtering is disabled).
 * `allowCustom` lets the user keep a free-text value not in the list.
 */
export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results.",
  allowCustom = false,
  clearable = true,
  disabled,
  loading,
  onSearchChange,
  selectedLabel,
  className,
  invalid,
}: {
  id?: string;
  options: ComboOption[];
  value: string | undefined;
  onChange: (value: string | undefined, option?: ComboOption) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  allowCustom?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onSearchChange?: (search: string) => void;
  /** Label to show when the selected value isn't in `options` (server-search mode). */
  selectedLabel?: string;
  className?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((o) => o.value === value);
  const shown = selected?.label ?? selectedLabel ?? value;
  const serverMode = Boolean(onSearchChange);
  const trimmed = search.trim();
  const showCustom =
    allowCustom && trimmed !== "" && !options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase());

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setSearch("");
          onSearchChange?.("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn("h-8 w-full justify-between px-2.5 font-normal", !shown && "text-muted-foreground", className)}
        >
          <span className="truncate">{shown || placeholder}</span>
          <span className="ml-2 flex shrink-0 items-center gap-1">
            {clearable && value && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Clear selection"
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(undefined);
                }}
              >
                <X className="size-3.5" />
              </span>
            )}
            <ChevronsUpDown className="size-3.5 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command shouldFilter={!serverMode}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={(s) => {
              setSearch(s);
              onSearchChange?.(s);
            }}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Searching…
              </div>
            ) : (
              <CommandEmpty>{emptyText}</CommandEmpty>
            )}
            {!loading && (
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.value} ${o.description ?? ""}`}
                    disabled={o.disabled}
                    onSelect={() => {
                      onChange(o.value, o);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("size-4", value === o.value ? "opacity-100" : "opacity-0")} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{o.label}</div>
                      {o.description && <div className="truncate text-xs text-muted-foreground">{o.description}</div>}
                    </div>
                    {o.hint && <span className="ml-2 shrink-0 text-xs text-muted-foreground">{o.hint}</span>}
                  </CommandItem>
                ))}
                {showCustom && (
                  <CommandItem
                    value={`__custom__ ${trimmed}`}
                    onSelect={() => {
                      onChange(trimmed);
                      setOpen(false);
                    }}
                  >
                    <Plus className="size-4" />
                    Use “{trimmed}”
                  </CommandItem>
                )}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
