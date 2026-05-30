import { useState } from "react";
import {
  useGetFleets,
  useGetFleetDrivers,
  useGetDriverRatings,
  getGetFleetDriversQueryKey,
  getGetDriverRatingsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Star, StarHalf, User } from "lucide-react";

function StarRating({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${n <= Math.round(value) ? "text-amber-400 fill-amber-400" : "text-muted"}`}
        />
      ))}
    </div>
  );
}

export default function RatingsPage() {
  const [selectedFleetId, setSelectedFleetId] = useState<number | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);

  const { data: fleets, isLoading: fleetsLoading } = useGetFleets();

  const { data: drivers, isLoading: driversLoading } = useGetFleetDrivers(
    selectedFleetId!,
    { query: { enabled: !!selectedFleetId, queryKey: getGetFleetDriversQueryKey(selectedFleetId!) } }
  );

  const { data: ratingsData, isLoading: ratingsLoading } = useGetDriverRatings(
    selectedDriverId!,
    { query: { enabled: !!selectedDriverId, queryKey: getGetDriverRatingsQueryKey(selectedDriverId!) } }
  );

  const selectedDriver = drivers?.find((d) => d.id === selectedDriverId);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight">Driver Ratings</h1>
        <p className="text-sm text-muted-foreground mt-1">View commuter ratings and feedback for your fleet drivers.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="space-y-1.5">
          <Label>Select Fleet</Label>
          {fleetsLoading ? (
            <Skeleton className="h-10 w-full rounded-md" />
          ) : (
            <Select
              value={selectedFleetId ? String(selectedFleetId) : ""}
              onValueChange={(v) => {
                setSelectedFleetId(Number(v));
                setSelectedDriverId(null);
              }}
            >
              <SelectTrigger data-testid="select-fleet">
                <SelectValue placeholder="Choose a fleet..." />
              </SelectTrigger>
              <SelectContent>
                {fleets?.map((f) => (
                  <SelectItem key={f.id} value={String(f.id)} data-testid={`option-fleet-${f.id}`}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Select Driver</Label>
          {driversLoading ? (
            <Skeleton className="h-10 w-full rounded-md" />
          ) : (
            <Select
              value={selectedDriverId ? String(selectedDriverId) : ""}
              onValueChange={(v) => setSelectedDriverId(Number(v))}
              disabled={!selectedFleetId}
            >
              <SelectTrigger data-testid="select-driver">
                <SelectValue placeholder={selectedFleetId ? "Choose a driver..." : "Select a fleet first"} />
              </SelectTrigger>
              <SelectContent>
                {drivers?.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)} data-testid={`option-driver-${d.id}`}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {selectedDriverId && (
        <>
          {ratingsLoading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}</div>
          ) : ratingsData ? (
            <>
              <Card className="mb-6">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg flex-shrink-0">
                      {selectedDriver?.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">{selectedDriver?.name}</div>
                      <div className="text-xs text-muted-foreground">@{selectedDriver?.username}</div>
                    </div>
                    <div className="ml-auto text-right">
                      <div className="text-3xl font-extrabold text-foreground" data-testid="text-average-rating">
                        {ratingsData.average.toFixed(1)}
                      </div>
                      <StarRating value={ratingsData.average} />
                      <div className="text-xs text-muted-foreground mt-0.5">{ratingsData.count} rating{ratingsData.count !== 1 ? "s" : ""}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {ratingsData.ratings.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Star className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                    <p className="text-muted-foreground font-medium">No ratings yet for this driver.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {ratingsData.ratings.map((r) => (
                    <Card key={r.id} data-testid={`card-rating-${r.id}`}>
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold flex-shrink-0">
                              {r.commuterName.charAt(0)}
                            </div>
                            <div>
                              <div className="text-sm font-semibold">{r.commuterName}</div>
                              {r.comment && (
                                <p className="text-sm text-muted-foreground mt-0.5">{r.comment}</p>
                              )}
                              <div className="text-xs text-muted-foreground mt-1">
                                {new Date(r.createdAt).toLocaleDateString("en-PH", {
                                  year: "numeric", month: "short", day: "numeric"
                                })}
                              </div>
                            </div>
                          </div>
                          <div className="flex-shrink-0">
                            <StarRating value={r.rating} />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </>
      )}

      {!selectedDriverId && (
        <Card>
          <CardContent className="py-16 text-center">
            <Star className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
            <p className="font-semibold text-foreground">Select a fleet and driver</p>
            <p className="text-muted-foreground text-sm mt-1">Choose a fleet and driver above to view their ratings.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
