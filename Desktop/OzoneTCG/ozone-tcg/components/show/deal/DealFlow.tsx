"use client";

import type { AutocompleteCard } from "@/components/CardAutocomplete";
import type { InventorySearchResult } from "@/app/protected/show/actions";
import { StepBar, type DealCard, type DealStep, type DealCustomerChoice, type DealTradeSelection, type SortBy, type PriceRange } from "./DealFlowShared";
import { DealStepEvaluate } from "./DealStepEvaluate";
import { DealStepQuote } from "./DealStepQuote";
import { DealStepFulfill } from "./DealStepFulfill";
import { DealStepComplete } from "./DealStepComplete";

export type DealFlowProps = {
  // Step
  step: DealStep;
  onStepChange: (s: DealStep) => void;

  // Cards
  cards: DealCard[];
  onRemoveCard: (id: string) => void;
  onSetDisposition: (id: string, d: DealCard["disposition"]) => void;
  onSetBuyPrice: (id: string, val: string) => void;

  // Add-card form
  addName: string;
  onAddNameChange: (v: string) => void;
  addCard: AutocompleteCard | null;
  onAddCardChange: (c: AutocompleteCard | null) => void;
  addMarket: string;
  onAddMarketChange: (v: string) => void;
  addCondition: string;
  onAddConditionChange: (v: string) => void;
  addGrade: string;
  onAddGradeChange: (v: string) => void;
  certOpen: boolean;
  onCertOpenChange: (v: boolean) => void;
  onAddCard: () => void;
  onScanDealAdd: () => void;

  // Quote
  cashPct: number;
  onCashPctChange: (p: number) => void;
  tradePct: number;
  onTradePctChange: (p: number) => void;
  customerChoice: DealCustomerChoice;
  onAllCash: () => void;
  onAllTrade: () => void;
  onSplit: () => void;

  // Fulfill
  inventoryDisplay: InventorySearchResult[];
  inventoryLoaded: boolean;
  inventoryTerms: string[];
  inventoryShowMore: boolean;
  onInventoryShowMoreToggle: () => void;
  inventoryQuery: string;
  onInventoryQueryChange: (v: string) => void;
  inventoryFilter: "all" | "single" | "slab" | "sealed";
  onInventoryFilterChange: (f: "all" | "single" | "slab" | "sealed") => void;
  sortBy: SortBy;
  onSortByChange: (s: SortBy) => void;
  priceRange: PriceRange;
  onPriceRangeChange: (r: PriceRange) => void;
  tradeSelections: DealTradeSelection[];
  onTradeSelectionsChange: (s: DealTradeSelection[]) => void;
  onScanDealInventory: () => void;

  // Complete
  completeSummary: { scanId: string; cashOut: number; tradeValue: number } | null;
  onComplete: () => Promise<void> | void;
  onReset: () => void;
  busy: boolean;
};

export function DealFlow(props: DealFlowProps) {
  const {
    step, onStepChange,
    cards, cashPct, tradePct, customerChoice,
    tradeSelections,
  } = props;

  // Derived values shared across steps
  const cashCards = cards.filter((c) => c.disposition === "cash");
  const tradeCards = cards.filter((c) => c.disposition === "trade");
  const undecidedCards = cards.filter((c) => c.disposition === "undecided");

  const cashTotal = cashCards.reduce(
    (s, c) => s + (c.buyPrice ?? (c.marketPrice ? c.marketPrice * cashPct / 100 : 0)),
    0,
  );
  const tradeTotal = tradeCards.reduce(
    (s, c) => s + (c.buyPrice ?? (c.marketPrice ? c.marketPrice * tradePct / 100 : 0)),
    0,
  );
  const totalMarket = cards.reduce((s, c) => s + (c.marketPrice ?? 0), 0);

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        background: "rgba(13,11,20,0.6)",
        borderRadius: 20,
        border: "1px solid rgba(139,92,246,0.12)",
        minHeight: 0,
        flex: 1,
      }}
    >
      <StepBar step={step} onStepChange={onStepChange} />

      <div className="flex flex-col flex-1 overflow-hidden">
        {step === "evaluate" && (
          <DealStepEvaluate
            cards={cards}
            cashPct={cashPct}
            addName={props.addName}
            onAddNameChange={props.onAddNameChange}
            addCard={props.addCard}
            onAddCardChange={props.onAddCardChange}
            addMarket={props.addMarket}
            onAddMarketChange={props.onAddMarketChange}
            addCondition={props.addCondition}
            onAddConditionChange={props.onAddConditionChange}
            addGrade={props.addGrade}
            onAddGradeChange={props.onAddGradeChange}
            certOpen={props.certOpen}
            onCertOpenChange={props.onCertOpenChange}
            onAdd={props.onAddCard}
            onRemove={props.onRemoveCard}
            onScanOpen={props.onScanDealAdd}
            onNext={() => onStepChange("quote")}
          />
        )}

        {step === "quote" && (
          <DealStepQuote
            cards={cards}
            cashCards={cashCards}
            tradeCards={tradeCards}
            undecidedCards={undecidedCards}
            cashTotal={cashTotal}
            tradeTotal={tradeTotal}
            totalMarket={totalMarket}
            cashPct={cashPct}
            onCashPctChange={props.onCashPctChange}
            tradePct={tradePct}
            onTradePctChange={props.onTradePctChange}
            customerChoice={customerChoice}
            onAllCash={props.onAllCash}
            onAllTrade={props.onAllTrade}
            onSplit={props.onSplit}
            onSetDisposition={props.onSetDisposition}
            onSetBuyPrice={props.onSetBuyPrice}
            onBack={() => onStepChange("evaluate")}
            onNext={() => onStepChange("fulfill")}
            onComplete={props.onComplete}
            busy={props.busy}
          />
        )}

        {step === "fulfill" && (
          <DealStepFulfill
            cashCards={cashCards}
            tradeCards={tradeCards}
            undecidedCards={undecidedCards}
            cashTotal={cashTotal}
            tradeTotal={tradeTotal}
            tradeSelections={tradeSelections}
            onTradeSelectionsChange={props.onTradeSelectionsChange}
            inventoryDisplay={props.inventoryDisplay}
            inventoryLoaded={props.inventoryLoaded}
            inventoryTerms={props.inventoryTerms}
            inventoryShowMore={props.inventoryShowMore}
            onInventoryShowMoreToggle={props.onInventoryShowMoreToggle}
            inventoryQuery={props.inventoryQuery}
            onInventoryQueryChange={props.onInventoryQueryChange}
            inventoryFilter={props.inventoryFilter}
            onInventoryFilterChange={props.onInventoryFilterChange}
            sortBy={props.sortBy}
            onSortByChange={props.onSortByChange}
            priceRange={props.priceRange}
            onPriceRangeChange={props.onPriceRangeChange}
            onScanOpen={props.onScanDealInventory}
            onBack={() => onStepChange("quote")}
            onComplete={props.onComplete}
            busy={props.busy}
          />
        )}

        {step === "complete" && (
          <DealStepComplete
            cards={cards}
            tradeSelections={tradeSelections}
            completeSummary={props.completeSummary}
            onReset={props.onReset}
          />
        )}
      </div>
    </div>
  );
}
