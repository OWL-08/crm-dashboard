import { useState, useEffect, useCallback, useRef } from "react";
import type { Customer, CustomerDetail, PipelineItem, AppView } from "./types";
import { useDebounce } from "./hooks/useDebounce";
import { searchCustomers, getPipeline, getCustomer } from "./api";
import ErrorBoundary from "./components/ErrorBoundary";
import Sidebar from "./components/Sidebar";
import Toolbar from "./components/Toolbar";
import PipelineBoard from "./components/PipelineBoard";
import CustomerList from "./components/CustomerList";
import DetailModal from "./components/DetailModal";
import AddCustomerModal from "./components/AddCustomerModal";
import ImportModal from "./components/ImportModal";
import TagManager from "./components/TagManager";
import AnalyticsPanel from "./components/AnalyticsPanel";
import CalendarPanel from "./components/CalendarPanel";
import "./App.css";

export default function App() {
  const [view, setView] = useState<AppView>("pipeline");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pipeline, setPipeline] = useState<PipelineItem[]>([]);
  const [selected, setSelected] = useState<CustomerDetail | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Search & filters
  const [search, setSearch] = useState("");
  const [searchMode, setSearchMode] = useState<"live" | "precise">("live");
  const [searchSubmitCount, setSearchSubmitCount] = useState(0);
  const [filterStage, setFilterStage] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterScale, setFilterScale] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  // Loading & error
  const [loadingPipeline, setLoadingPipeline] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [customerError, setCustomerError] = useState<string | null>(null);

  // Pagination
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [offset, setOffset] = useState(0);
  const PAGE_SIZE = 50;

  // ── Race-condition guards ──

  // Monotonic request ID: each loadCustomerData() call increments it;
  // responses that carry a stale ID are discarded.
  const searchReqId = useRef(0);

  // Prevents concurrent "load more" invocations.
  const loadingMore = useRef(false);

  // Tracks whether the view just changed — suppresses the filter-effect
  // double-fire that would otherwise re-query with a stale debouncedSearch.
  const viewJustChanged = useRef(false);

  // ── Data loading ──

  const loadPipelineData = useCallback(async () => {
    setLoadingPipeline(true);
    setPipelineError(null);
    try {
      // In precise mode: use search directly (only set on submit).
      // In live mode: search cleared? show unfiltered immediately (no debounce wait).
      const effectiveSearch = searchMode === "precise"
        ? (search || null)
        : search !== "" ? (search || null) : null;
      // All search & filter logic moved to backend for consistency
      const data = await getPipeline(
        filterStage || null,
        effectiveSearch,
        filterCountry || null,
        filterType || null,
        filterScale || null,
      );
      setPipeline(data);
    } catch (e) {
      setPipelineError(String(e));
    } finally {
      setLoadingPipeline(false);
    }
  }, [filterStage, search, debouncedSearch, filterCountry, filterType, filterScale, searchMode]);

  const loadCustomerData = useCallback(async (resetOffset = true) => {
    // Guard: if resetting (fresh search) or loading more, prevent duplicates
    if (!resetOffset && loadingMore.current) return;
    if (resetOffset) loadingMore.current = false; // fresh load resets the guard

    setLoadingCustomers(true);
    setCustomerError(null);

    // Snapshot current offset BEFORE async gap
    const effectiveOffset = resetOffset ? 0 : offset;
    // Update offset eagerly for "load more" to prevent duplicates
    if (!resetOffset) {
      loadingMore.current = true;
      setOffset(effectiveOffset + PAGE_SIZE);
    } else {
      setOffset(PAGE_SIZE);
    }

    // Live mode: raw search on fresh load, debounced for "load more"
    // Precise mode: always use the submitted search directly (instant)
    const effectiveKeyword = (() => {
      if (searchMode === "precise") return search || null;
      return (resetOffset ? search : debouncedSearch) || null;
    })();

    // Tag this request — later responses with a different tag are stale
    const thisReqId = ++searchReqId.current;
    try {
      const result = await searchCustomers({
        keyword: effectiveKeyword,
        country: filterCountry || null,
        stage: null,
        customer_type: filterType || null,
        scale: filterScale || null,
        limit: PAGE_SIZE,
        offset: effectiveOffset,
      });
      // Discard stale responses (newer search started)
      if (searchReqId.current !== thisReqId) return;

      if (resetOffset) {
        setCustomers(result.customers);
      } else {
        setCustomers(prev => [...prev, ...result.customers]);
      }
      setTotalCustomers(result.total);
    } catch (e) {
      setCustomerError(String(e));
    } finally {
      setLoadingCustomers(false);
      loadingMore.current = false;
    }
  }, [search, debouncedSearch, filterCountry, filterType, filterScale, offset, searchMode]);

  // Reload on view change (view effect fires before filter effect)
  useEffect(() => {
    if (view === "pipeline") loadPipelineData();
    else if (view === "customers") loadCustomerData(true);
  }, [view]);

  // Live mode: reload customers when debouncedSearch or filters change
  useEffect(() => {
    if (searchMode !== "live") return;
    if (viewJustChanged.current) {
      viewJustChanged.current = false;
      return;
    }
    if (view === "customers") loadCustomerData(true);
  }, [debouncedSearch, filterCountry, filterType, filterScale, searchMode]);

  // Precise mode: reload customers only on submit
  useEffect(() => {
    if (searchMode !== "precise") return;
    if (viewJustChanged.current) {
      viewJustChanged.current = false;
      return;
    }
    if (view === "customers") loadCustomerData(true);
  }, [searchSubmitCount, filterCountry, filterType, filterScale, searchMode]);

  // Reload pipeline when filters change
  useEffect(() => {
    if (view === "pipeline") loadPipelineData();
  }, [loadPipelineData]);

  const handleSearchSubmit = useCallback(() => {
    setSearchSubmitCount(c => c + 1);
  }, []);

  const openDetail = async (id: number) => {
    try {
      const data = await getCustomer(id);
      if (data) setSelected(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleViewChange = (v: AppView) => {
    // Bypass debounce delay: mark so filter effect skips its first run
    viewJustChanged.current = true;
    setView(v);
    setSearch("");
    setFilterStage("");
    setFilterCountry("");
    setFilterType("");
    setFilterScale("");
    setOffset(0);
  };

  const renderContent = () => {
    switch (view) {
      case "pipeline":
        return (
          <PipelineBoard
            items={pipeline}
            onSelect={openDetail}
            loading={loadingPipeline}
            error={pipelineError}
            onRetry={loadPipelineData}
          />
        );
      case "customers":
        return (
          <CustomerList
            customers={customers}
            onSelect={openDetail}
            loading={loadingCustomers}
            error={customerError}
            onRetry={() => loadCustomerData(true)}
            total={totalCustomers}
            onLoadMore={() => loadCustomerData(false)}
            hasMore={totalCustomers > offset}
          />
        );
      case "analytics":
        return <AnalyticsPanel />;
      case "calendar":
        return <CalendarPanel />;
      case "tags":
        return <TagManager />;
      default:
        return null;
    }
  };

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden">
        <Sidebar
          view={view}
          onViewChange={handleViewChange}
          onAdd={() => setShowAdd(true)}
          onImport={() => setShowImport(true)}
          customerCount={totalCustomers || undefined}
        />

        <main className="flex-1 flex flex-col overflow-hidden">
          <Toolbar
            view={view}
            search={search}
            onSearchChange={setSearch}
            onSearchSubmit={handleSearchSubmit}
            searchMode={searchMode}
            onSearchModeChange={setSearchMode}
            filterStage={filterStage}
            onFilterStageChange={setFilterStage}
            filterCountry={filterCountry}
            onFilterCountryChange={setFilterCountry}
            filterType={filterType}
            onFilterTypeChange={setFilterType}
            filterScale={filterScale}
            onFilterScaleChange={setFilterScale}
            resultCount={view === "customers" ? totalCustomers : undefined}
          />

          <div className="flex-1 overflow-auto p-4">
            {renderContent()}
          </div>
        </main>

        {/* Modals */}
        {showAdd && (
          <AddCustomerModal
            onClose={() => {
              setShowAdd(false);
              if (view === "pipeline") loadPipelineData();
              else loadCustomerData(true);
            }}
          />
        )}
        {showImport && <ImportModal onClose={() => {
          setShowImport(false);
          if (view === "pipeline") loadPipelineData();
          else loadCustomerData(true);
        }} />}
        {selected && (
          <DetailModal
            detail={selected}
            onClose={() => setSelected(null)}
            onUpdate={() => {
              if (view === "pipeline") loadPipelineData();
              else loadCustomerData(true);
              if (selected?.customer?.id) openDetail(selected.customer.id);
            }}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
