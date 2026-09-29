import { useEffect } from "react";
import type { TripPlan, PoiCategory, ItineraryItem } from "@travel/shared";

export const KIND_LABEL: Record<PoiCategory, string> = {
  attraction: "景点",
  food: "美食",
  hotel: "住宿",
  transport: "交通",
  shopping: "购物",
  other: "其他",
};

export function itemKey(day: number, index: number): string {
  return `${day}-${index}`;
}

interface ItemRowProps {
  item: ItineraryItem;
  itemKey: string;
  selected: boolean;
  onSelect: (key: string) => void;
}

function ItemRow({ item, itemKey, selected, onSelect }: ItemRowProps) {
  const clickable = !!item.location;
  return (
    <div className="item" id={`item-${itemKey}`}>
      <div className="item-time">{item.time || "--:--"}</div>
      <div className="item-dot" />
      <div
        className={`item-card${clickable ? " clickable" : ""}${selected ? " selected" : ""}`}
        onClick={clickable ? () => onSelect(itemKey) : undefined}
      >
        <div className="item-head">
          <span className="item-title">{item.title}</span>
          <span className={`kind kind-${item.kind}`}>{KIND_LABEL[item.kind] ?? "其他"}</span>
        </div>
        {item.note && <div className="item-note">{item.note}</div>}
        {item.tag && item.tag.length > 0 && (
          <div className="item-tags">
            {item.tag.slice(0, 6).map((t, i) => (
              <span key={i} className="item-tag">
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="item-meta">
          {item.rating && <span>★ {item.rating}</span>}
          {item.cost && <span>约 {item.cost}</span>}
          {item.address && <span>{item.address}</span>}
        </div>
      </div>
    </div>
  );
}

interface ItineraryViewProps {
  itinerary: TripPlan | null;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

export function ItineraryView({ itinerary, selectedKey, onSelect }: ItineraryViewProps) {
  useEffect(() => {
    if (!selectedKey) return;
    const el = document.getElementById(`item-${selectedKey}`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedKey]);

  if (!itinerary) return null;
  return (
    <div className="itinerary">
      <div className="itinerary-header">
        <h2>{itinerary.destination}</h2>
        {itinerary.summary && <p>{itinerary.summary}</p>}
      </div>
      {itinerary.days.map((day) => (
        <div className="day" key={day.day}>
          <h3>
            第 {day.day} 天{day.title ? ` · ${day.title}` : ""}
          </h3>
          <div className="day-items">
            {day.items.map((item, i) => (
              <ItemRow
                key={i}
                item={item}
                itemKey={itemKey(day.day, i)}
                selected={selectedKey === itemKey(day.day, i)}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}