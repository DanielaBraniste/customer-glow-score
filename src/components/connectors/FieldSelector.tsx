import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ConnectorField } from "./connectorFields";

interface FieldSelectorProps {
  fields: ConnectorField[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

const FieldSelector = ({ fields, selected, onToggle, onSelectAll, onDeselectAll }: FieldSelectorProps) => {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">Fields to Import</p>
        <div className="flex gap-2">
          <button onClick={onSelectAll} className="text-[10px] text-primary hover:underline">
            Select all
          </button>
          <span className="text-[10px] text-muted-foreground">|</span>
          <button onClick={onDeselectAll} className="text-[10px] text-primary hover:underline">
            Deselect all
          </button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">Choose which data fields to sync. You can change this later.</p>
      <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto pr-1">
        {fields.map((field) => (
          <label
            key={field.key}
            className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/50 cursor-pointer transition-colors"
          >
            <Checkbox
              checked={selected.has(field.key)}
              onCheckedChange={() => onToggle(field.key)}
              className="mt-0.5"
            />
            <div className="min-w-0">
              <span className="text-xs font-medium">{field.label}</span>
              <p className="text-[10px] text-muted-foreground leading-tight">{field.description}</p>
            </div>
          </label>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground pt-1">
        {selected.size} of {fields.length} fields selected
      </p>
    </div>
  );
};

export default FieldSelector;
