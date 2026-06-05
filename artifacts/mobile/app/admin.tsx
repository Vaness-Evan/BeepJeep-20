import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Platform, TextInput, ActivityIndicator, Modal, Alert, Animated,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useSocket } from "@/context/SocketContext";
import MapWebView, { MapWebViewRef } from "@/components/MapWebView";
import MobileRouteBuilder, { Waypoint } from "@/components/MobileRouteBuilder";
import { apiJson, API_BASE } from "@/lib/api";

type AdminTab = "map" | "fleet" | "reports";

interface Fleet {
  id: number;
  name: string;
  jeepCount: number;
  driverCount: number;
  createdAt: string;
}

interface JeepDriver {
  id: number;
  name: string;
  username: string;
  route: string | null;
}

interface Jeep {
  id: number;
  fleetId: number;
  vehicleNumber: string;
  driver: JeepDriver | null;
  createdAt: string;
}

interface UnassignedDriver {
  id: number;
  name: string;
  username: string;
}

interface Summary {
  totalFareToday: number;
  totalPassengersToday: number;
  regularCount: number;
  studentCount: number;
  seniorCount: number;
  totalDrivers: number;
  totalFleetDrivers: number;
  totalFleets: number;
}

interface DriverRatings {
  ratings: { id: number; commuterName: string; rating: number; comment: string | null; createdAt: string }[];
  average: number;
  count: number;
}

interface FareRates {
  regularFare: number;
  studentFare: number;
  seniorFare: number;
}

interface FleetRoute {
  fleetId: number;
  name: string;
  waypoints: Waypoint[];
  routeCoords: Waypoint[];
}

export default function AdminScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout, token } = useAuth();
  const { drivers, connected, routeUpdates, removedFleetIds } = useSocket();
  const mapRef = useRef<MapWebViewRef>(null);
  const [mapReady, setMapReady] = useState(false);
  const [tab, setTab] = useState<AdminTab>("map");
  const [mapStatsVisible, setMapStatsVisible] = useState(true);
  const statsAnim = useRef(new Animated.Value(1)).current;
  const [showProfile, setShowProfile] = useState(false);

  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [fleetsLoading, setFleetsLoading] = useState(false);
  const [expandedFleet, setExpandedFleet] = useState<number | null>(null);
  const [fleetJeeps, setFleetJeeps] = useState<Record<number, Jeep[]>>({});
  const [fleetDriverIds, setFleetDriverIds] = useState<Set<number>>(new Set());

  // Create fleet
  const [showCreateFleet, setShowCreateFleet] = useState(false);
  const [newFleetName, setNewFleetName] = useState("");
  const [creating, setCreating] = useState(false);

  // Add jeep
  const [showAddJeep, setShowAddJeep] = useState(false);
  const [addJeepFleetId, setAddJeepFleetId] = useState<number | null>(null);
  const [newVehicleNumber, setNewVehicleNumber] = useState("");
  const [addingJeep, setAddingJeep] = useState(false);

  // Assign driver
  const [showAssignDriver, setShowAssignDriver] = useState(false);
  const [assignJeepId, setAssignJeepId] = useState<number | null>(null);
  const [assignFleetId, setAssignFleetId] = useState<number | null>(null);
  const [unassignedDrivers, setUnassignedDrivers] = useState<UnassignedDriver[]>([]);
  const [unassignedLoading, setUnassignedLoading] = useState(false);
  const [showCreateDriverForm, setShowCreateDriverForm] = useState(false);
  const [newDriverForm, setNewDriverForm] = useState({ name: "", username: "", password: "" });
  const [assigningDriver, setAssigningDriver] = useState(false);

  const [driverRatings, setDriverRatings] = useState<Record<number, DriverRatings>>({});
  const [ratingsFleetDriverId, setRatingsFleetDriverId] = useState<number | null>(null);
  const [showRatings, setShowRatings] = useState(false);

  const [showFareSettings, setShowFareSettings] = useState(false);
  const [fareFleetId, setFareFleetId] = useState<number | null>(null);
  const [fareRates, setFareRates] = useState<FareRates>({ regularFare: 13, studentFare: 10, seniorFare: 10 });
  const [editFares, setEditFares] = useState({ regular: "", student: "", senior: "" });
  const [savingFares, setSavingFares] = useState(false);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  const [fleetRoutes, setFleetRoutes] = useState<Record<number, FleetRoute>>({});
  const [showRouteBuilder, setShowRouteBuilder] = useState(false);
  const [routeBuilderFleetId, setRouteBuilderFleetId] = useState<number | null>(null);
  const [routeBuilderSaving, setRouteBuilderSaving] = useState(false);

  const topPad = Platform.OS === "web" ? 0 : insets.top;
  const bottomPad = Platform.OS === "web" ? 0 : insets.bottom;

  const fleetOnlyDrivers = fleetDriverIds.size > 0
    ? drivers.filter((d) => fleetDriverIds.has(parseInt(d.driverId)))
    : [];

  useEffect(() => {
    if (mapReady) mapRef.current?.setDrivers(fleetOnlyDrivers);
  }, [mapReady, fleetOnlyDrivers]);

  useEffect(() => {
    if (mapReady) {
      const routes = Object.values(fleetRoutes);
      if (routes.length > 0) {
        mapRef.current?.setAllRoutes(
          routes.map((r) => ({ fleetId: r.fleetId, coords: r.routeCoords, name: r.name }))
        );
      }
    }
  }, [mapReady, fleetRoutes]);

  useEffect(() => {
    if (!mapReady) return;
    routeUpdates.forEach((r) => {
      setFleetRoutes((prev) => ({
        ...prev,
        [r.fleetId]: { fleetId: r.fleetId, name: r.name, waypoints: [], routeCoords: r.routeCoords },
      }));
      mapRef.current?.setFleetRoute(r.fleetId, r.routeCoords, r.name);
    });
  }, [routeUpdates, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    removedFleetIds.forEach((id) => {
      setFleetRoutes((prev) => { const n = { ...prev }; delete n[id]; return n; });
      mapRef.current?.removeFleetRoute(id);
    });
  }, [removedFleetIds, mapReady]);

  useEffect(() => {
    loadFleets();
  }, []);

  useEffect(() => {
    if (tab === "reports") loadSummary();
  }, [tab]);

  async function loadFleets() {
    setFleetsLoading(true);
    try {
      const data = await apiJson<Fleet[]>("/fleets");
      setFleets(data);
      const allIds = new Set<number>();
      await Promise.all(
        data.map(async (fleet) => {
          try {
            const jeepsData = await apiJson<Jeep[]>(`/fleets/${fleet.id}/jeeps`);
            jeepsData.forEach((j) => { if (j.driver) allIds.add(j.driver.id); });
            setFleetJeeps((prev) => ({ ...prev, [fleet.id]: jeepsData }));
          } catch {}
          try {
            const routeData = await apiJson<FleetRoute>(`/routes/fleet/${fleet.id}`);
            if (routeData?.waypoints?.length) {
              setFleetRoutes((prev) => ({ ...prev, [fleet.id]: routeData }));
            }
          } catch {}
        })
      );
      setFleetDriverIds(allIds);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setFleetsLoading(false);
    }
  }

  async function loadFleetJeeps(fleetId: number) {
    try {
      const data = await apiJson<Jeep[]>(`/fleets/${fleetId}/jeeps`);
      setFleetJeeps((prev) => ({ ...prev, [fleetId]: data }));
      const allIds = new Set(fleetDriverIds);
      data.forEach((j) => { if (j.driver) allIds.add(j.driver.id); });
      setFleetDriverIds(allIds);
    } catch {}
  }

  function openRouteBuilder(fleetId: number) {
    setRouteBuilderFleetId(fleetId);
    setShowRouteBuilder(true);
    Haptics.selectionAsync();
  }

  async function handleRouteSave(name: string, waypoints: Waypoint[], routeCoords: Waypoint[]) {
    if (!routeBuilderFleetId) return;
    setRouteBuilderSaving(true);
    try {
      const saved = await apiJson<FleetRoute>(`/routes/fleet/${routeBuilderFleetId}`, {
        method: "PUT",
        body: JSON.stringify({ name, waypoints, routeCoords }),
      });
      setFleetRoutes((prev) => ({ ...prev, [routeBuilderFleetId]: saved }));
      mapRef.current?.setFleetRoute(saved.fleetId, saved.routeCoords, saved.name);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowRouteBuilder(false);
      Alert.alert("Route saved!", "Drivers and commuters can now see this route.");
    } catch (e: any) {
      Alert.alert("Error saving route", e.message ?? "Please try again.");
    } finally {
      setRouteBuilderSaving(false);
    }
  }

  function handleRouteCancel() {
    setShowRouteBuilder(false);
  }

  function toggleFleet(fleetId: number) {
    if (expandedFleet === fleetId) {
      setExpandedFleet(null);
    } else {
      setExpandedFleet(fleetId);
      if (!fleetJeeps[fleetId]) loadFleetJeeps(fleetId);
    }
    Haptics.selectionAsync();
  }

  async function createFleet() {
    if (!newFleetName.trim()) return;
    setCreating(true);
    try {
      const fleet = await apiJson<Fleet>("/fleets", { method: "POST", body: JSON.stringify({ name: newFleetName.trim() }) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewFleetName("");
      setShowCreateFleet(false);
      await loadFleets();
      // Auto-expand new fleet and prompt to add a jeep
      setExpandedFleet(fleet.id);
      setFleetJeeps((prev) => ({ ...prev, [fleet.id]: [] }));
      setTimeout(() => {
        setAddJeepFleetId(fleet.id);
        setShowAddJeep(true);
      }, 400);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setCreating(false);
    }
  }

  function openAddJeep(fleetId: number) {
    setAddJeepFleetId(fleetId);
    setNewVehicleNumber("");
    setShowAddJeep(true);
    Haptics.selectionAsync();
  }

  async function createJeep() {
    if (!newVehicleNumber.trim() || !addJeepFleetId) return;
    setAddingJeep(true);
    try {
      const jeep = await apiJson<Jeep>(`/fleets/${addJeepFleetId}/jeeps`, {
        method: "POST",
        body: JSON.stringify({ vehicleNumber: newVehicleNumber.trim() }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setFleetJeeps((prev) => ({ ...prev, [addJeepFleetId]: [...(prev[addJeepFleetId] ?? []), jeep] }));
      setNewVehicleNumber("");
      setShowAddJeep(false);
      loadFleets();
      // Immediately prompt to assign a driver
      setTimeout(() => {
        openAssignDriver(jeep.id, addJeepFleetId!);
      }, 400);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setAddingJeep(false);
    }
  }

  async function openAssignDriver(jeepId: number, fleetId: number) {
    setAssignJeepId(jeepId);
    setAssignFleetId(fleetId);
    setShowCreateDriverForm(false);
    setNewDriverForm({ name: "", username: "", password: "" });
    setUnassignedLoading(true);
    setShowAssignDriver(true);
    try {
      const data = await apiJson<UnassignedDriver[]>(`/fleets/${fleetId}/unassigned-drivers`);
      setUnassignedDrivers(data);
    } catch {
      setUnassignedDrivers([]);
    } finally {
      setUnassignedLoading(false);
    }
  }

  async function assignExistingDriver(driverId: number) {
    if (!assignJeepId) return;
    setAssigningDriver(true);
    try {
      const result = await apiJson<{ jeepId: number; driver: JeepDriver }>(`/jeeps/${assignJeepId}/assign-driver`, {
        method: "POST",
        body: JSON.stringify({ driverId }),
      });
      setFleetJeeps((prev) => {
        const fleetId = assignFleetId!;
        return {
          ...prev,
          [fleetId]: (prev[fleetId] ?? []).map((j) =>
            j.id === assignJeepId ? { ...j, driver: result.driver } : j
          ),
        };
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAssignDriver(false);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setAssigningDriver(false);
    }
  }

  async function createAndAssignDriver() {
    if (!assignJeepId || !newDriverForm.name || !newDriverForm.username || newDriverForm.password.length < 6) return;
    setAssigningDriver(true);
    try {
      const result = await apiJson<{ jeepId: number; driver: JeepDriver }>(`/jeeps/${assignJeepId}/assign-driver`, {
        method: "POST",
        body: JSON.stringify(newDriverForm),
      });
      setFleetJeeps((prev) => {
        const fleetId = assignFleetId!;
        return {
          ...prev,
          [fleetId]: (prev[fleetId] ?? []).map((j) =>
            j.id === assignJeepId ? { ...j, driver: result.driver } : j
          ),
        };
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAssignDriver(false);
      setNewDriverForm({ name: "", username: "", password: "" });
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setAssigningDriver(false);
    }
  }

  async function unassignDriver(jeepId: number, fleetId: number, driverName: string) {
    Alert.alert("Unassign Driver", `Remove ${driverName} from this jeep?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unassign", style: "destructive", onPress: async () => {
          try {
            await apiJson(`/jeeps/${jeepId}/driver`, { method: "DELETE" });
            setFleetJeeps((prev) => ({
              ...prev,
              [fleetId]: (prev[fleetId] ?? []).map((j) =>
                j.id === jeepId ? { ...j, driver: null } : j
              ),
            }));
          } catch (e: any) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);
  }

  async function removeJeep(jeepId: number, fleetId: number, vehicleNumber: string) {
    Alert.alert("Remove Jeep", `Remove jeep ${vehicleNumber} from fleet?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive", onPress: async () => {
          try {
            await apiJson(`/jeeps/${jeepId}`, { method: "DELETE" });
            setFleetJeeps((prev) => ({
              ...prev,
              [fleetId]: (prev[fleetId] ?? []).filter((j) => j.id !== jeepId),
            }));
            loadFleets();
          } catch (e: any) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);
  }

  async function viewDriverRatings(driverId: number) {
    if (driverRatings[driverId]) {
      setRatingsFleetDriverId(driverId);
      setShowRatings(true);
      return;
    }
    try {
      const data = await apiJson<DriverRatings>(`/ratings/driver/${driverId}`);
      setDriverRatings((prev) => ({ ...prev, [driverId]: data }));
      setRatingsFleetDriverId(driverId);
      setShowRatings(true);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not load ratings.");
    }
  }

  async function openFareSettings(fleetId: number) {
    setFareFleetId(fleetId);
    try {
      const data = await apiJson<FareRates>(`/fare-settings?fleetId=${fleetId}`);
      setFareRates(data);
      setEditFares({ regular: String(data.regularFare), student: String(data.studentFare), senior: String(data.seniorFare) });
    } catch {
      setEditFares({ regular: "13", student: "10", senior: "10" });
    }
    setShowFareSettings(true);
  }

  async function saveFareSettings() {
    if (!fareFleetId) return;
    const regular = parseFloat(editFares.regular);
    const student = parseFloat(editFares.student);
    const senior = parseFloat(editFares.senior);
    if (isNaN(regular) || isNaN(student) || isNaN(senior) || regular <= 0 || student <= 0 || senior <= 0) {
      Alert.alert("Invalid", "Please enter valid positive fare amounts.");
      return;
    }
    setSavingFares(true);
    try {
      await apiJson("/fare-settings", {
        method: "PUT",
        body: JSON.stringify({ regularFare: regular, studentFare: student, seniorFare: senior, fleetId: fareFleetId }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowFareSettings(false);
      Alert.alert("Saved", "Fare settings updated for this fleet.");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not save fare settings.");
    } finally {
      setSavingFares(false);
    }
  }

  async function loadSummary() {
    setSummaryLoading(true);
    try {
      const data = await apiJson<Summary>("/reports/summary");
      setSummary(data);
    } catch {}
    finally { setSummaryLoading(false); }
  }

  async function exportReport(format: "xlsx" | "csv") {
    if (!token) {
      Alert.alert("Not authenticated", "Please log in again.");
      return;
    }
    setExporting(format);
    try {
      const url = `${API_BASE}/reports/export?format=${format}&token=${encodeURIComponent(token)}&days=30`;
      if (Platform.OS === "web") {
        (window as any).open(url, "_blank");
      } else {
        await WebBrowser.openBrowserAsync(url);
      }
    } catch (e: any) {
      Alert.alert("Export failed", e.message);
    } finally {
      setExporting(null);
    }
  }

  function toggleMapStats() {
    const next = !mapStatsVisible;
    setMapStatsVisible(next);
    Animated.spring(statsAnim, {
      toValue: next ? 1 : 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }

  function handleLogout() {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/");
        },
      },
    ]);
  }

  const s = makeStyles(colors);
  const activeDrivers = fleetOnlyDrivers.filter((d) => d.status !== "offline");
  const currentRatings = ratingsFleetDriverId ? driverRatings[ratingsFleetDriverId] : null;

  return (
    <View style={[s.root, { paddingTop: topPad, paddingBottom: bottomPad }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.headerLeft} onPress={() => setShowProfile(true)} activeOpacity={0.8}>
          <View style={s.avatar}>
            <MaterialCommunityIcons name="shield-account" size={20} color="#fff" />
          </View>
          <View>
            <Text style={s.headerTitle}>{user?.name ?? "Admin"}</Text>
            <View style={s.statusRow}>
              <View style={[s.dot, { backgroundColor: connected ? colors.success : colors.mutedForeground }]} />
              <Text style={s.statusText}>{activeDrivers.length} active driver{activeDrivers.length !== 1 ? "s" : ""}</Text>
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleLogout} style={s.logoutBtn}>
          <Feather name="log-out" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={s.tabBar}>
        {(["map", "fleet", "reports"] as AdminTab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.tabItem, tab === t && s.tabItemActive]}
            onPress={() => setTab(t)}
          >
            <MaterialCommunityIcons
              name={t === "map" ? "map" : t === "fleet" ? "bus-multiple" : "file-chart"}
              size={18}
              color={tab === t ? colors.primary : colors.mutedForeground}
            />
            <Text style={[s.tabLabel, tab === t && s.tabLabelActive]}>
              {t === "map" ? "Live Map" : t === "fleet" ? "Fleet" : "Reports"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* MAP TAB */}
      {tab === "map" && (
        <View style={s.mapContainer}>
          <MapWebView ref={mapRef} style={{ flex: 1 }} onMapReady={() => setMapReady(true)} />
          <View style={s.mapLegend}>
            <View style={s.legendItem}><View style={[s.ldot, { backgroundColor: colors.primary }]} /><Text style={s.legendText}>Available</Text></View>
            <View style={s.legendItem}><View style={[s.ldot, { backgroundColor: "#EF4444" }]} /><Text style={s.legendText}>Full</Text></View>
          </View>
          <TouchableOpacity style={s.mapToggleBtn} onPress={toggleMapStats} activeOpacity={0.8}>
            <Feather name={mapStatsVisible ? "chevron-down" : "chevron-up"} size={16} color={colors.primary} />
          </TouchableOpacity>
          <Animated.View
            style={[s.mapStats, {
              opacity: statsAnim,
              transform: [{ translateY: statsAnim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }]
            }]}
            pointerEvents={mapStatsVisible ? "auto" : "none"}
          >
            {[
              { label: "Active", value: activeDrivers.length, color: colors.primary },
              { label: "Full", value: drivers.filter(d => d.status === "full").length, color: "#EF4444" },
              { label: "Riders", value: drivers.reduce((s, d) => s + (d.passengerCount || 0), 0), color: colors.success },
            ].map(({ label, value, color }) => (
              <View key={label} style={s.mapStat}>
                <Text style={[s.mapStatNum, { color }]}>{value}</Text>
                <Text style={s.mapStatLabel}>{label}</Text>
              </View>
            ))}
          </Animated.View>
        </View>
      )}

      {/* FLEET TAB */}
      {tab === "fleet" && (
        <ScrollView style={s.tabContent} contentContainerStyle={s.tabPadding}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>My Fleets</Text>
            <TouchableOpacity style={s.addBtn} onPress={() => setShowCreateFleet(true)}>
              <Feather name="plus" size={16} color="#fff" />
              <Text style={s.addBtnText}>New Fleet</Text>
            </TouchableOpacity>
          </View>

          {fleetsLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          ) : fleets.length === 0 ? (
            <View style={s.empty}>
              <MaterialCommunityIcons name="bus-multiple" size={40} color={colors.mutedForeground} />
              <Text style={s.emptyText}>No fleets yet</Text>
              <Text style={s.emptySubtext}>Create a fleet to start managing jeeps and drivers</Text>
            </View>
          ) : (
            fleets.map((fleet) => (
              <View key={fleet.id} style={s.fleetCard}>
                <TouchableOpacity style={s.fleetHeader} onPress={() => toggleFleet(fleet.id)}>
                  <View style={s.fleetIcon}>
                    <MaterialCommunityIcons name="bus-multiple" size={20} color={colors.primary} />
                  </View>
                  <View style={s.fleetInfo}>
                    <Text style={s.fleetName}>{fleet.name}</Text>
                    <Text style={s.fleetMeta}>{fleet.jeepCount ?? fleet.driverCount} jeep{(fleet.jeepCount ?? fleet.driverCount) !== 1 ? "s" : ""}</Text>
                  </View>
                  <TouchableOpacity style={s.fareSettingsBtn} onPress={() => openFareSettings(fleet.id)}>
                    <MaterialCommunityIcons name="cash-edit" size={16} color={colors.primary} />
                    <Text style={s.fareSettingsBtnText}>Fares</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.fareSettingsBtn, { backgroundColor: fleetRoutes[fleet.id] ? "#fff7ed" : "#f3f4f6", borderColor: fleetRoutes[fleet.id] ? colors.primary : "#e5e7eb", borderWidth: 1 }]}
                    onPress={() => openRouteBuilder(fleet.id)}
                  >
                    <MaterialCommunityIcons name="map-marker-path" size={16} color={fleetRoutes[fleet.id] ? colors.primary : colors.mutedForeground} />
                    <Text style={[s.fareSettingsBtnText, { color: fleetRoutes[fleet.id] ? colors.primary : colors.mutedForeground }]}>
                      {fleetRoutes[fleet.id] ? "Route" : "Add Route"}
                    </Text>
                  </TouchableOpacity>
                  <Feather name={expandedFleet === fleet.id ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
                </TouchableOpacity>

                {expandedFleet === fleet.id && (
                  <View style={s.fleetBody}>
                    <TouchableOpacity style={s.addJeepBtn} onPress={() => openAddJeep(fleet.id)}>
                      <MaterialCommunityIcons name="bus-plus" size={16} color={colors.primary} />
                      <Text style={s.addJeepBtnText}>Add Jeep</Text>
                    </TouchableOpacity>

                    {!fleetJeeps[fleet.id] ? (
                      <ActivityIndicator color={colors.primary} size="small" style={{ marginTop: 8 }} />
                    ) : fleetJeeps[fleet.id].length === 0 ? (
                      <Text style={s.noJeeps}>No jeeps in this fleet yet</Text>
                    ) : (
                      fleetJeeps[fleet.id].map((jeep) => (
                        <View key={jeep.id} style={s.jeepCard}>
                          {/* Jeep header row */}
                          <View style={s.jeepHeaderRow}>
                            <View style={s.jeepIcon}>
                              <MaterialCommunityIcons name="bus" size={18} color={colors.primary} />
                            </View>
                            <View style={s.jeepInfo}>
                              <Text style={s.jeepVehicleNumber}>{jeep.vehicleNumber}</Text>
                              {jeep.driver ? (
                                <Text style={s.jeepDriverName}>{jeep.driver.name}</Text>
                              ) : (
                                <Text style={s.jeepNoDriver}>No driver assigned</Text>
                              )}
                            </View>
                            <View style={s.jeepActions}>
                              {jeep.driver && (
                                <TouchableOpacity onPress={() => viewDriverRatings(jeep.driver!.id)} style={s.iconBtn}>
                                  <Feather name="star" size={14} color="#F59E0B" />
                                </TouchableOpacity>
                              )}
                              <TouchableOpacity onPress={() => removeJeep(jeep.id, fleet.id, jeep.vehicleNumber)} style={s.iconBtn}>
                                <Feather name="trash-2" size={14} color={colors.destructive} />
                              </TouchableOpacity>
                            </View>
                          </View>

                          {/* Driver section */}
                          <View style={s.jeepDriverSection}>
                            {jeep.driver ? (
                              <View style={s.jeepDriverRow}>
                                <View style={s.driverPill}>
                                  <MaterialCommunityIcons name="account" size={13} color={colors.primary} />
                                  <Text style={s.driverPillText}>@{jeep.driver.username}</Text>
                                  {jeep.driver.route && (
                                    <Text style={s.driverRoutePill}>{jeep.driver.route}</Text>
                                  )}
                                </View>
                                <TouchableOpacity style={s.changeDriverBtn} onPress={() => openAssignDriver(jeep.id, fleet.id)}>
                                  <Feather name="refresh-cw" size={12} color={colors.mutedForeground} />
                                  <Text style={s.changeDriverBtnText}>Change</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={s.unassignBtn} onPress={() => unassignDriver(jeep.id, fleet.id, jeep.driver!.name)}>
                                  <Feather name="user-minus" size={12} color={colors.destructive} />
                                </TouchableOpacity>
                              </View>
                            ) : (
                              <TouchableOpacity style={s.assignDriverBtn} onPress={() => openAssignDriver(jeep.id, fleet.id)}>
                                <Feather name="user-plus" size={14} color={colors.primary} />
                                <Text style={s.assignDriverBtnText}>Assign Driver</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* REPORTS TAB */}
      {tab === "reports" && (
        <ScrollView style={s.tabContent} contentContainerStyle={s.tabPadding}>
          <Text style={s.sectionTitle}>Fleet Summary — Today</Text>

          {summaryLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          ) : summary && (
            <>
              <View style={s.statsGrid}>
                <StatCard icon="cash" label="Total Fare" value={`₱${summary.totalFareToday.toFixed(2)}`} color={colors.success} colors={colors} />
                <StatCard icon="account-group" label="Passengers" value={String(summary.totalPassengersToday)} color={colors.primary} colors={colors} />
              </View>
              <View style={s.statsGrid}>
                <StatCard icon="bus-multiple" label="My Fleets" value={String(summary.totalFleets ?? 0)} color={colors.warning} colors={colors} />
                <StatCard icon="bus" label="Fleet Drivers" value={String(summary.totalFleetDrivers)} color="#8B5CF6" colors={colors} />
              </View>

              <View style={s.breakdown}>
                <Text style={s.breakdownTitle}>Passenger Breakdown</Text>
                {[
                  { label: "Regular", count: summary.regularCount, color: colors.primary },
                  { label: "Student", count: summary.studentCount, color: colors.success },
                  { label: "Senior", count: summary.seniorCount, color: colors.warning },
                ].map(({ label, count, color }) => (
                  <View key={label} style={s.breakdownRow}>
                    <View style={[s.breakdownDot, { backgroundColor: color }]} />
                    <Text style={s.breakdownLabel}>{label}</Text>
                    <View style={s.progressTrack}>
                      <View style={[s.progressBar, { backgroundColor: color, flex: summary.totalPassengersToday ? count / summary.totalPassengersToday : 0 }]} />
                    </View>
                    <Text style={s.breakdownCount}>{count}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <Text style={[s.sectionTitle, { marginTop: 20 }]}>Export Fleet Reports</Text>
          <Text style={s.exportNote}>Exports last 30 days of fare records for your fleets</Text>

          <View style={s.exportRow}>
            <TouchableOpacity style={[s.exportBtn, s.exportXlsx]} onPress={() => exportReport("xlsx")} disabled={!!exporting} activeOpacity={0.8}>
              {exporting === "xlsx" ? <ActivityIndicator color="#fff" size="small" /> : <MaterialCommunityIcons name="microsoft-excel" size={22} color="#fff" />}
              <Text style={s.exportBtnText}>Excel (.xlsx)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.exportBtn, s.exportCsv]} onPress={() => exportReport("csv")} disabled={!!exporting} activeOpacity={0.8}>
              {exporting === "csv" ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="file-text" size={22} color="#fff" />}
              <Text style={s.exportBtnText}>CSV (.csv)</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.refreshBtn} onPress={loadSummary}>
            <Feather name="refresh-cw" size={16} color={colors.primary} />
            <Text style={s.refreshBtnText}>Refresh Summary</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* CREATE FLEET MODAL */}
      <Modal visible={showCreateFleet} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Create Fleet</Text>
            <Text style={s.modalSub}>Step 1 of 3 — Name your fleet</Text>
            <TextInput
              style={s.modalInput}
              placeholder="Fleet name (e.g. Antipolo Fleet)"
              placeholderTextColor={colors.mutedForeground}
              value={newFleetName}
              onChangeText={setNewFleetName}
              autoFocus
            />
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalCancel} onPress={() => { setShowCreateFleet(false); setNewFleetName(""); }}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalConfirm, (!newFleetName.trim() || creating) && s.btnDisabled]}
                onPress={createFleet}
                disabled={!newFleetName.trim() || creating}
              >
                {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.modalConfirmText}>Next →</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ADD JEEP MODAL */}
      <Modal visible={showAddJeep} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Add Jeep</Text>
            <Text style={s.modalSub}>Step 2 of 3 — Enter the vehicle number</Text>
            <TextInput
              style={s.modalInput}
              placeholder="Vehicle number (e.g. AAA 1234)"
              placeholderTextColor={colors.mutedForeground}
              value={newVehicleNumber}
              onChangeText={setNewVehicleNumber}
              autoCapitalize="characters"
              autoFocus
            />
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalCancel} onPress={() => { setShowAddJeep(false); setNewVehicleNumber(""); }}>
                <Text style={s.modalCancelText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalConfirm, (!newVehicleNumber.trim() || addingJeep) && s.btnDisabled]}
                onPress={createJeep}
                disabled={!newVehicleNumber.trim() || addingJeep}
              >
                {addingJeep ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.modalConfirmText}>Next →</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ASSIGN DRIVER MODAL */}
      <Modal visible={showAssignDriver} transparent animationType="slide">
        <ScrollView contentContainerStyle={s.modalOverlay} keyboardShouldPersistTaps="handled">
          <View style={[s.modal, { paddingBottom: 24 }]}>
            {!showCreateDriverForm ? (
              <>
                <Text style={s.modalTitle}>Assign Driver</Text>
                <Text style={s.modalSub}>Step 3 of 3 — Choose an existing driver or create one</Text>

                {unassignedLoading ? (
                  <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
                ) : unassignedDrivers.length > 0 ? (
                  <>
                    <Text style={s.assignSectionLabel}>Available drivers in this fleet</Text>
                    {unassignedDrivers.map((d) => (
                      <TouchableOpacity
                        key={d.id}
                        style={s.driverOption}
                        onPress={() => assignExistingDriver(d.id)}
                        disabled={assigningDriver}
                      >
                        <View style={s.driverOptionAvatar}>
                          <MaterialCommunityIcons name="account" size={18} color={colors.primary} />
                        </View>
                        <View style={s.driverOptionInfo}>
                          <Text style={s.driverOptionName}>{d.name}</Text>
                          <Text style={s.driverOptionUsername}>@{d.username}</Text>
                        </View>
                        {assigningDriver ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                        )}
                      </TouchableOpacity>
                    ))}
                    <View style={s.divider} />
                  </>
                ) : (
                  <Text style={s.noUnassignedText}>No unassigned drivers in this fleet yet.</Text>
                )}

                <TouchableOpacity style={s.createDriverBtn} onPress={() => setShowCreateDriverForm(true)}>
                  <Feather name="user-plus" size={16} color="#fff" />
                  <Text style={s.createDriverBtnText}>Create New Driver</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[s.modalCancel, { marginTop: 12 }]} onPress={() => setShowAssignDriver(false)}>
                  <Text style={s.modalCancelText}>Skip for now</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={s.modalTitle}>Create Driver</Text>
                <Text style={s.modalSub}>Set login credentials for the new driver</Text>
                {[
                  { key: "name", placeholder: "Driver name", autoCapitalize: "words" },
                  { key: "username", placeholder: "Username (for login)", autoCapitalize: "none" },
                  { key: "password", placeholder: "Password (min 6 chars)", secure: true },
                ].map(({ key, placeholder, autoCapitalize, secure }) => (
                  <TextInput
                    key={key}
                    style={s.modalInput}
                    placeholder={placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    value={(newDriverForm as any)[key]}
                    onChangeText={(v) => setNewDriverForm((f) => ({ ...f, [key]: v }))}
                    autoCapitalize={(autoCapitalize as any) ?? "words"}
                    secureTextEntry={secure}
                    autoCorrect={false}
                  />
                ))}
                <View style={s.modalBtns}>
                  <TouchableOpacity style={s.modalCancel} onPress={() => setShowCreateDriverForm(false)}>
                    <Text style={s.modalCancelText}>← Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.modalConfirm, (!newDriverForm.name || !newDriverForm.username || newDriverForm.password.length < 6 || assigningDriver) && s.btnDisabled]}
                    onPress={createAndAssignDriver}
                    disabled={!newDriverForm.name || !newDriverForm.username || newDriverForm.password.length < 6 || assigningDriver}
                  >
                    {assigningDriver ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.modalConfirmText}>Create & Assign</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </Modal>

      {/* DRIVER RATINGS MODAL */}
      <Modal visible={showRatings} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modal, { maxHeight: "80%" }]}>
            <Text style={s.modalTitle}>Driver Ratings</Text>
            {currentRatings ? (
              <>
                <View style={s.ratingsSummary}>
                  <Text style={s.ratingsAvg}>{currentRatings.average.toFixed(1)}</Text>
                  <View style={s.ratingsStars}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Feather key={star} name="star" size={18} color={star <= Math.round(currentRatings.average) ? "#F59E0B" : colors.border} />
                    ))}
                  </View>
                  <Text style={s.ratingsCount}>{currentRatings.count} review{currentRatings.count !== 1 ? "s" : ""}</Text>
                </View>
                <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                  {currentRatings.ratings.length === 0 ? (
                    <Text style={s.noRatingsText}>No ratings yet</Text>
                  ) : (
                    currentRatings.ratings.map((r) => (
                      <View key={r.id} style={s.ratingItem}>
                        <View style={s.ratingItemHeader}>
                          <Text style={s.ratingCommuterName}>{r.commuterName}</Text>
                          <View style={s.ratingStarsSmall}>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Feather key={star} name="star" size={12} color={star <= r.rating ? "#F59E0B" : colors.border} />
                            ))}
                          </View>
                        </View>
                        {r.comment && <Text style={s.ratingComment}>{r.comment}</Text>}
                      </View>
                    ))
                  )}
                </ScrollView>
              </>
            ) : (
              <ActivityIndicator color={colors.primary} />
            )}
            <TouchableOpacity style={[s.modalClose, { marginTop: 16 }]} onPress={() => setShowRatings(false)}>
              <Text style={s.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* FARE SETTINGS MODAL */}
      <Modal visible={showFareSettings} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Fleet Fare Settings</Text>
            <Text style={s.modalSub}>Set fare rates for all drivers in this fleet</Text>
            {[
              { label: "Regular Fare (₱)", key: "regular" as const },
              { label: "Student Fare (₱)", key: "student" as const },
              { label: "Senior Fare (₱)", key: "senior" as const },
            ].map(({ label, key }) => (
              <View key={key} style={s.fareInputRow}>
                <Text style={s.fareInputLabel}>{label}</Text>
                <TextInput
                  style={s.fareInput}
                  value={editFares[key]}
                  onChangeText={(v) => setEditFares((p) => ({ ...p, [key]: v }))}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
            ))}
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setShowFareSettings(false)}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalConfirm, savingFares && s.btnDisabled]}
                onPress={saveFareSettings}
                disabled={savingFares}
              >
                {savingFares ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.modalConfirmText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PROFILE MODAL */}
      <Modal visible={showProfile} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <View style={s.profileHeader}>
              <View style={s.profileAvatar}>
                <MaterialCommunityIcons name="shield-account" size={36} color="#fff" />
              </View>
              <Text style={s.profileName}>{user?.name ?? "Admin"}</Text>
              <Text style={s.profileUsername}>@{user?.username}</Text>
              <View style={s.roleBadge}>
                <MaterialCommunityIcons name="shield-account" size={13} color={colors.primary} />
                <Text style={s.roleBadgeText}>Administrator</Text>
              </View>
            </View>
            <TouchableOpacity style={s.modalClose} onPress={() => setShowProfile(false)}>
              <Text style={s.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ROUTE BUILDER MODAL */}
      <Modal
        visible={showRouteBuilder}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleRouteCancel}
      >
        <View style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={[s.routeBuilderHeader, { paddingTop: topPad > 0 ? topPad : 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.routeBuilderTitle}>
                {routeBuilderFleetId && fleetRoutes[routeBuilderFleetId] ? "Edit Route" : "Add Route"}
              </Text>
              {routeBuilderFleetId && (
                <Text style={s.routeBuilderSubtitle}>
                  {fleets.find((f) => f.id === routeBuilderFleetId)?.name ?? ""}
                </Text>
              )}
            </View>
            <TouchableOpacity style={s.routeBuilderClose} onPress={handleRouteCancel}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {routeBuilderSaving && (
            <View style={s.routeBuilderSavingOverlay}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={s.routeBuilderSavingText}>Saving route…</Text>
            </View>
          )}

          <View style={s.routeBuilderHint}>
            <MaterialCommunityIcons name="map-marker-path" size={14} color={colors.primary} />
            <Text style={s.routeBuilderHintText}>
              {routeBuilderFleetId && fleetRoutes[routeBuilderFleetId]
                ? "Route saved — tap the map to move pins or add new ones"
                : "Search a place or tap the map to place pins • OSRM road-snapping enabled"}
            </Text>
          </View>

          {showRouteBuilder && routeBuilderFleetId !== null && (
            <MobileRouteBuilder
              fleetName={fleets.find((f) => f.id === routeBuilderFleetId)?.name ?? "Fleet"}
              initialName={fleetRoutes[routeBuilderFleetId]?.name}
              initialWaypoints={fleetRoutes[routeBuilderFleetId]?.waypoints}
              initialRouteCoords={fleetRoutes[routeBuilderFleetId]?.routeCoords}
              onSave={handleRouteSave}
              onCancel={handleRouteCancel}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

function StatCard({ icon, label, value, color, colors }: any) {
  const s = makeStyles(colors);
  return (
    <View style={[s.statCard, { flex: 1 }]}>
      <MaterialCommunityIcons name={icon} size={24} color={color} />
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" },
    headerTitle: { fontSize: 16, fontWeight: "800", color: c.foreground },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    statusText: { fontSize: 12, color: c.mutedForeground },
    logoutBtn: { padding: 8 },
    tabBar: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.border },
    tabItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
    tabItemActive: { borderBottomWidth: 2, borderBottomColor: c.primary },
    tabLabel: { fontSize: 13, fontWeight: "600", color: c.mutedForeground },
    tabLabelActive: { color: c.primary },
    mapContainer: { flex: 1, position: "relative" },
    mapLegend: {
      position: "absolute", top: 10, right: 10,
      backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 10, padding: 8, gap: 5,
    },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    ldot: { width: 9, height: 9, borderRadius: 5 },
    legendText: { fontSize: 11, color: c.foreground, fontWeight: "600" },
    mapToggleBtn: {
      position: "absolute", top: 10, left: 10,
      backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 20, padding: 8,
      shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1, shadowRadius: 4, elevation: 4,
    },
    mapStats: {
      position: "absolute", bottom: 16, left: 16, right: 16,
      backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 16,
      flexDirection: "row", padding: 12,
    },
    mapStat: { flex: 1, alignItems: "center" },
    mapStatNum: { fontSize: 20, fontWeight: "800" },
    mapStatLabel: { fontSize: 11, color: c.mutedForeground, marginTop: 2 },
    tabContent: { flex: 1 },
    tabPadding: { padding: 20, paddingBottom: 40 },
    sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
    sectionTitle: { fontSize: 13, fontWeight: "700", color: c.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 },
    addBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
    addBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
    empty: { alignItems: "center", gap: 8, paddingVertical: 40 },
    emptyText: { fontSize: 16, fontWeight: "700", color: c.mutedForeground },
    emptySubtext: { fontSize: 13, color: c.mutedForeground, textAlign: "center" },
    fleetCard: { backgroundColor: c.card, borderRadius: 16, marginBottom: 12, overflow: "hidden", borderWidth: 1, borderColor: c.border },
    fleetHeader: { flexDirection: "row", alignItems: "center", padding: 16 },
    fleetIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.secondary, alignItems: "center", justifyContent: "center", marginRight: 12 },
    fleetInfo: { flex: 1 },
    fleetName: { fontSize: 15, fontWeight: "700", color: c.foreground },
    fleetMeta: { fontSize: 12, color: c.mutedForeground, marginTop: 2 },
    fareSettingsBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.secondary, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 5, marginRight: 8 },
    fareSettingsBtnText: { fontSize: 11, fontWeight: "700", color: c.primary },
    fleetBody: { padding: 16, paddingTop: 8, gap: 10 },
    addJeepBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1.5, borderColor: c.primary, alignSelf: "flex-start", marginBottom: 4 },
    addJeepBtnText: { fontSize: 13, fontWeight: "600", color: c.primary },
    noJeeps: { fontSize: 13, color: c.mutedForeground, paddingVertical: 8 },
    jeepCard: { backgroundColor: c.background, borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
    jeepHeaderRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
    jeepIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.secondary, alignItems: "center", justifyContent: "center" },
    jeepInfo: { flex: 1 },
    jeepVehicleNumber: { fontSize: 15, fontWeight: "800", color: c.foreground },
    jeepDriverName: { fontSize: 12, color: c.mutedForeground, marginTop: 1 },
    jeepNoDriver: { fontSize: 12, color: "#F59E0B", marginTop: 1, fontWeight: "600" },
    jeepActions: { flexDirection: "row", gap: 4 },
    iconBtn: { padding: 6 },
    jeepDriverSection: { borderTopWidth: 1, borderTopColor: c.border, paddingHorizontal: 12, paddingVertical: 10 },
    jeepDriverRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    driverPill: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.secondary, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
    driverPillText: { fontSize: 12, color: c.foreground, fontWeight: "600" },
    driverRoutePill: { fontSize: 11, color: c.mutedForeground },
    changeDriverBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: c.border },
    changeDriverBtnText: { fontSize: 11, color: c.mutedForeground, fontWeight: "600" },
    unassignBtn: { padding: 6 },
    assignDriverBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: c.primary },
    assignDriverBtnText: { fontSize: 13, fontWeight: "600", color: c.primary },
    statsGrid: { flexDirection: "row", gap: 12, marginBottom: 12 },
    statCard: { backgroundColor: c.card, borderRadius: 16, padding: 16, alignItems: "center", gap: 4, borderWidth: 1, borderColor: c.border },
    statValue: { fontSize: 22, fontWeight: "800" },
    statLabel: { fontSize: 12, color: c.mutedForeground },
    breakdown: { backgroundColor: c.card, borderRadius: 16, padding: 16, gap: 10, marginTop: 4, borderWidth: 1, borderColor: c.border },
    breakdownTitle: { fontSize: 13, fontWeight: "700", color: c.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
    breakdownRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    breakdownDot: { width: 8, height: 8, borderRadius: 4 },
    breakdownLabel: { fontSize: 13, color: c.foreground, width: 54 },
    progressTrack: { flex: 1, height: 6, backgroundColor: c.secondary, borderRadius: 3, flexDirection: "row", overflow: "hidden" },
    progressBar: { borderRadius: 3 },
    breakdownCount: { fontSize: 13, fontWeight: "700", color: c.foreground, width: 28, textAlign: "right" },
    exportNote: { fontSize: 12, color: c.mutedForeground, marginBottom: 12 },
    exportRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
    exportBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 14 },
    exportXlsx: { backgroundColor: "#217346" },
    exportCsv: { backgroundColor: "#0369A1" },
    exportBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    refreshBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: c.border },
    refreshBtnText: { fontSize: 14, fontWeight: "600", color: c.primary },
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "flex-end" },
    modal: { width: "100%", backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
    modalTitle: { fontSize: 18, fontWeight: "800", color: c.foreground, marginBottom: 4 },
    modalSub: { fontSize: 13, color: c.mutedForeground, marginBottom: 16 },
    modalInput: {
      borderWidth: 1, borderColor: c.border, borderRadius: 12,
      padding: 12, fontSize: 14, color: c.foreground,
      backgroundColor: c.background, marginBottom: 10,
    },
    modalBtns: { flexDirection: "row", gap: 12, marginTop: 8 },
    modalCancel: { flex: 1, backgroundColor: c.secondary, borderRadius: 14, padding: 14, alignItems: "center" },
    modalCancelText: { color: c.mutedForeground, fontWeight: "700", fontSize: 15 },
    modalConfirm: { flex: 1, backgroundColor: c.primary, borderRadius: 14, padding: 14, alignItems: "center" },
    modalConfirmText: { color: "#fff", fontWeight: "700", fontSize: 15 },
    btnDisabled: { opacity: 0.4 },
    assignSectionLabel: { fontSize: 12, fontWeight: "700", color: c.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
    driverOption: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.border },
    driverOptionAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.secondary, alignItems: "center", justifyContent: "center" },
    driverOptionInfo: { flex: 1 },
    driverOptionName: { fontSize: 14, fontWeight: "700", color: c.foreground },
    driverOptionUsername: { fontSize: 12, color: c.mutedForeground },
    divider: { height: 1, backgroundColor: c.border, marginVertical: 12 },
    noUnassignedText: { fontSize: 13, color: c.mutedForeground, textAlign: "center", paddingVertical: 16 },
    createDriverBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: c.primary, borderRadius: 14, padding: 14 },
    createDriverBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
    profileHeader: { alignItems: "center", gap: 8, marginBottom: 20 },
    profileAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" },
    profileName: { fontSize: 20, fontWeight: "800", color: c.foreground },
    profileUsername: { fontSize: 14, color: c.mutedForeground },
    roleBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: c.secondary, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, marginTop: 4 },
    roleBadgeText: { fontSize: 12, fontWeight: "700", color: c.primary },
    modalClose: { backgroundColor: c.secondary, borderRadius: 14, padding: 14, alignItems: "center" },
    modalCloseText: { color: c.primary, fontWeight: "700", fontSize: 15 },
    ratingsSummary: { alignItems: "center", gap: 4, marginBottom: 16 },
    ratingsAvg: { fontSize: 40, fontWeight: "800", color: "#F59E0B" },
    ratingsStars: { flexDirection: "row", gap: 4 },
    ratingsCount: { fontSize: 13, color: c.mutedForeground },
    noRatingsText: { textAlign: "center", color: c.mutedForeground, paddingVertical: 20 },
    ratingItem: { borderTopWidth: 1, borderTopColor: c.border, paddingVertical: 10, gap: 4 },
    ratingItemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    ratingCommuterName: { fontSize: 13, fontWeight: "700", color: c.foreground },
    ratingStarsSmall: { flexDirection: "row", gap: 2 },
    ratingComment: { fontSize: 12, color: c.mutedForeground },
    fareInputRow: { marginBottom: 12 },
    fareInputLabel: { fontSize: 13, fontWeight: "600", color: c.mutedForeground, marginBottom: 6 },
    fareInput: {
      borderWidth: 1, borderColor: c.border, borderRadius: 12,
      padding: 12, color: c.foreground, fontSize: 16, fontWeight: "700",
      backgroundColor: c.background,
    },
    routeBuilderHeader: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: "#fff",
    },
    routeBuilderTitle: { fontSize: 17, fontWeight: "800", color: c.foreground },
    routeBuilderSubtitle: { fontSize: 12, color: c.mutedForeground, marginTop: 1 },
    routeBuilderClose: { padding: 8, borderRadius: 20, backgroundColor: c.secondary },
    routeBuilderHint: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: 16, paddingVertical: 8,
      backgroundColor: "#fff7ed", borderBottomWidth: 1, borderBottomColor: "#fed7aa",
    },
    routeBuilderHintText: { fontSize: 12, color: "#92400e", flex: 1 },
    routeBuilderSavingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(255,255,255,0.85)",
      alignItems: "center", justifyContent: "center", zIndex: 99, gap: 12,
    },
    routeBuilderSavingText: { fontSize: 15, fontWeight: "600", color: c.foreground },
  });
}
