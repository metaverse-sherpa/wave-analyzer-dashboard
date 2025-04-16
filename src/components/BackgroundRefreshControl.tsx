import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useDataRefresh } from '@/hooks/useDataRefresh';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, PlayCircle, StopCircle, Activity, ClockIcon, ToggleLeft, ToggleRight } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

// Create a custom event to notify other components when refresh is complete
export const REFRESH_COMPLETED_EVENT = 'background-refresh-completed';
export const ELLIOTT_WAVE_REFRESH_COMPLETED_EVENT = 'elliott-wave-refresh-completed';

// Key for storing schedule settings in Supabase
const SCHEDULE_SETTINGS_KEY = 'elliott_wave_schedule_settings';

// Schedule options
const SCHEDULE_OPTIONS = [
  { value: '24', label: 'Every 24 hours' },
  { value: '12', label: 'Every 12 hours' },
  { value: '6', label: 'Every 6 hours' },
  { value: '1', label: 'Every hour (testing)' }
];

function BackgroundRefreshControl() {
  const { 
    startBackgroundRefresh, 
    stopBackgroundRefresh, 
    refreshElliottWaveAnalysis, // Using the new function
    refreshData 
  } = useDataRefresh();
  
  const { settings } = useAdminSettings();
  const [isRunning, setIsRunning] = useState(false);
  const [lastHeartbeat, setLastHeartbeat] = useState<Date | null>(null);
  const [taskCount, setTaskCount] = useState(0);
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [operationActive, setOperationActive] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [currentSymbol, setCurrentSymbol] = useState<string | null>(null);
  const [totalStocks, setTotalStocks] = useState<number>(0);
  const [processedStocks, setProcessedStocks] = useState<number>(0);
  const [debugLogEnabled, setDebugLogEnabled] = useState<boolean>(false);
  const [ignoreCache, setIgnoreCache] = useState<boolean>(false);
  
  // Schedule state
  const [scheduledRefreshEnabled, setScheduledRefreshEnabled] = useState<boolean>(false);
  const [refreshInterval, setRefreshInterval] = useState<string>('24');
  const [nextScheduledRun, setNextScheduledRun] = useState<Date | null>(null);
  const [lastScheduledRun, setLastScheduledRun] = useState<Date | null>(null);

  // Listen for worker messages
  useEffect(() => {
    // Function to handle worker messages that are broadcast as CustomEvents
    const handleWorkerMessage = (event: CustomEvent) => {
      const { action, timestamp, activeTaskCount, step, message, progress: progressValue } = event.detail;

      // Debug logging to help diagnose issues
      if (debugLogEnabled) {
        console.log(`Worker message received: ${action}`, event.detail);
      }
      
      if (action === 'HEARTBEAT') {
        setLastHeartbeat(new Date(timestamp));
        setTaskCount(activeTaskCount || 0);
        setIsRunning(activeTaskCount > 0 || activeTaskCount?.activeOperationsCount > 0);
      } else if (action === 'REFRESHES_PAUSED' || action === 'ALL_REFRESHES_STOPPED') {
        setIsRunning(false);
        setOperationActive(false);
        setProgress(0);
        setStatusMessage('');
        setCurrentSymbol(null);
      } else if (action === 'REFRESH_STARTED' || action === 'FULL_REFRESH_STARTED') {
        setIsRunning(true);
        setOperationActive(true);
        setProgress(0);
        setStatusMessage('Starting data refresh...');
      } else if (action === 'ELLIOTT_WAVE_ANALYSIS_STARTED') {
        // Handle Elliott Wave analysis specific events
        setIsRunning(true);
        setOperationActive(true);
        setProgress(0);
        setStatusMessage('Starting Elliott Wave analysis for all stocks...');
      } else if (action === 'FULL_REFRESH_COMPLETED' || action === 'ELLIOTT_WAVE_ANALYSIS_COMPLETED') {
        // Unified handler for completion of either operation
        const isElliottWave = action === 'ELLIOTT_WAVE_ANALYSIS_COMPLETED';
        
        setStatusMessage(isElliottWave 
          ? 'Elliott Wave analysis completed!' 
          : 'Data refresh completed!');
          
        setProgress(100);
        setCurrentSymbol(null);

        // Dispatch appropriate event to notify other components
        const eventName = isElliottWave 
          ? ELLIOTT_WAVE_REFRESH_COMPLETED_EVENT 
          : REFRESH_COMPLETED_EVENT;
          
        const refreshCompletedEvent = new CustomEvent(eventName, {
          detail: { timestamp: Date.now(), isScheduled: event.detail.isScheduled }
        });
        window.dispatchEvent(refreshCompletedEvent);
        
        // Update last scheduled run time if this was initiated by a schedule
        if (event.detail.isScheduled) {
          const now = new Date();
          setLastScheduledRun(now);
          
          // Update settings in Supabase
          updateScheduleSettingsInSupabase({
            enabled: scheduledRefreshEnabled,
            interval: refreshInterval,
            lastRun: now.toISOString(),
            nextRun: calculateNextRunTime(now, parseInt(refreshInterval, 10)).toISOString()
          });
        }
        
        // Reset progress after a delay
        setTimeout(() => {
          setProgress(0);
          setStatusMessage('');
          setOperationActive(false);
        }, 5000);
      } else if (action === 'FULL_REFRESH_ERROR' || action === 'ELLIOTT_WAVE_ANALYSIS_ERROR') {
        setStatusMessage(`Error: ${event.detail.error || 'Unknown error'}`);
        setOperationActive(false);
        setProgress(0);
        setCurrentSymbol(null);
      } else if (action === 'OPERATION_STATUS') {
        // Make sure operation is marked as active
        setOperationActive(true);
        
        // Extract detailed message information
        if (message) {
          setStatusMessage(message);
          
          // Try to parse stock symbol and progress from message
          const stockMatch = message.match(/for ([A-Z]+) \((\d+)\/(\d+)\)/);
          if (stockMatch) {
            const symbol = stockMatch[1];
            const current = parseInt(stockMatch[2], 10);
            const total = parseInt(stockMatch[3], 10);
            
            setCurrentSymbol(symbol);
            setProcessedStocks(current);
            setTotalStocks(total);
          }
        }
        
        // Update step if provided
        if (step) {
          setCurrentStep(step);
        }
        
        // Update progress if provided
        if (typeof progressValue === 'number') {
          // Ensure progress is between 0-100
          const normalizedProgress = Math.min(100, Math.max(0, progressValue));
          setProgress(normalizedProgress);
        }
      } else if (action === 'SCHEDULED_REFRESH_STATUS') {
        // Update schedule information
        if (event.detail.nextRun) {
          setNextScheduledRun(new Date(event.detail.nextRun));
        }
        if (event.detail.lastRun) {
          setLastScheduledRun(new Date(event.detail.lastRun));
        }
      }
    };

    // Add event listener for custom events broadcast by our DataRefreshManager
    window.addEventListener('worker-message', handleWorkerMessage as EventListener);
    
    // Enable debug logging in development
    if (import.meta.env.DEV) {
      setDebugLogEnabled(true);
    }
    
    // Clean up
    return () => {
      window.removeEventListener('worker-message', handleWorkerMessage as EventListener);
    };
  }, [scheduledRefreshEnabled, refreshInterval]);

  // Load scheduled refresh settings from Supabase
  useEffect(() => {
    async function loadScheduleSettings() {
      try {
        const { data, error } = await supabase
          .from('cache')
          .select('data')
          .eq('key', SCHEDULE_SETTINGS_KEY)
          .single();
        
        if (error) {
          console.log('No schedule settings found, using defaults');
          return;
        }
        
        if (data?.data) {
          const settings = data.data;
          
          // Update state with settings from database
          setScheduledRefreshEnabled(settings.enabled || false);
          setRefreshInterval(settings.interval || '24');
          if (settings.lastRun) {
            setLastScheduledRun(new Date(settings.lastRun));
          }
          if (settings.nextRun) {
            setNextScheduledRun(new Date(settings.nextRun));
          }
          
          console.log('Loaded schedule settings:', settings);
        }
      } catch (error) {
        console.error('Error loading schedule settings:', error);
      }
    }
    
    loadScheduleSettings();
  }, []);
  
  // Check for scheduled runs
  useEffect(() => {
    // Only active if scheduled refresh is enabled
    if (!scheduledRefreshEnabled) return;
    
    const checkSchedule = () => {
      const now = new Date();
      
      // If next run time is in the past, trigger a refresh
      if (nextScheduledRun && now > nextScheduledRun) {
        console.log(`Scheduled Elliott Wave analysis refresh triggered at ${now.toLocaleString()}`);
        
        // Only trigger if not already running
        if (!isRunning && !operationActive) {
          triggerScheduledRefresh();
        }
      }
    };
    
    // Check every minute
    const intervalId = setInterval(checkSchedule, 60 * 1000);
    
    // Do an initial check
    checkSchedule();
    
    return () => clearInterval(intervalId);
  }, [scheduledRefreshEnabled, nextScheduledRun, isRunning, operationActive]);

  // Calculate the next run time based on the interval
  const calculateNextRunTime = (fromDate: Date, hours: number): Date => {
    const nextRun = new Date(fromDate);
    nextRun.setHours(nextRun.getHours() + hours);
    return nextRun;
  };
  
  // Update schedule settings in Supabase
  const updateScheduleSettingsInSupabase = async (settings: any) => {
    try {
      await supabase
        .from('cache')
        .upsert({
          key: SCHEDULE_SETTINGS_KEY,
          data: settings,
          timestamp: Date.now(),
          duration: 365 * 24 * 60 * 60 * 1000 // 1 year
        }, { onConflict: 'key' });
      
      console.log('Schedule settings saved to Supabase:', settings);
    } catch (error) {
      console.error('Error saving schedule settings:', error);
    }
  };
  
  // Toggle scheduled refresh
  const handleToggleSchedule = async () => {
    const newState = !scheduledRefreshEnabled;
    setScheduledRefreshEnabled(newState);
    
    // Update next run time if enabled
    let newNextRunTime = nextScheduledRun;
    if (newState) {
      const now = new Date();
      newNextRunTime = calculateNextRunTime(now, parseInt(refreshInterval, 10));
      setNextScheduledRun(newNextRunTime);
    }
    
    // Save to Supabase
    await updateScheduleSettingsInSupabase({
      enabled: newState,
      interval: refreshInterval,
      lastRun: lastScheduledRun?.toISOString(),
      nextRun: newNextRunTime?.toISOString()
    });
    
    toast.success(newState 
      ? `Scheduled refresh enabled - next run ${newNextRunTime?.toLocaleString()}` 
      : 'Scheduled refresh disabled');
  };
  
  // Handle changing the refresh interval
  const handleIntervalChange = async (value: string) => {
    setRefreshInterval(value);
    
    // Update next run time based on new interval
    if (scheduledRefreshEnabled) {
      const now = new Date();
      const newNextRunTime = calculateNextRunTime(now, parseInt(value, 10));
      setNextScheduledRun(newNextRunTime);
      
      // Save to Supabase
      await updateScheduleSettingsInSupabase({
        enabled: scheduledRefreshEnabled,
        interval: value,
        lastRun: lastScheduledRun?.toISOString(),
        nextRun: newNextRunTime.toISOString()
      });
      
      toast.success(`Schedule updated - next run ${newNextRunTime.toLocaleString()}`);
    } else {
      // Just save the interval preference
      await updateScheduleSettingsInSupabase({
        enabled: false,
        interval: value,
        lastRun: lastScheduledRun?.toISOString(),
        nextRun: null
      });
    }
  };
  
  // Trigger a scheduled refresh
  const triggerScheduledRefresh = async () => {
    // Set status indicators first
    setStatusMessage('Starting scheduled Elliott Wave analysis...');
    setOperationActive(true);
    setProgress(0);
    setIsRunning(true);
    
    try {
      // Call directly the function in DataRefreshManager with ignoreCache option
      const success = await refreshElliottWaveAnalysis({ 
        isScheduled: true,
        ignoreCache
      });
      
      if (!success) {
        throw new Error("Elliott Wave analysis failed");
      }
      
      // Update last and next run times
      const now = new Date();
      setLastScheduledRun(now);
      
      // Calculate and set next run time
      const nextRun = calculateNextRunTime(now, parseInt(refreshInterval, 10));
      setNextScheduledRun(nextRun);
      
      // Update DB with new times
      updateScheduleSettingsInSupabase({
        enabled: scheduledRefreshEnabled,
        interval: refreshInterval,
        lastRun: now.toISOString(),
        nextRun: nextRun.toISOString()
      });
    } catch (error) {
      console.error("Error during scheduled Elliott Wave analysis:", error);
      setStatusMessage('Failed to complete Elliott Wave analysis');
      toast.error('Scheduled Elliott Wave analysis failed');
      
      setTimeout(() => {
        setOperationActive(false);
        setStatusMessage('');
        setIsRunning(false);
      }, 3000);
    }
  };

  // Manual Elliott Wave Analysis Refresh
  const runElliottWaveAnalysis = async () => {
    setStatusMessage('Starting Elliott Wave analysis...');
    setOperationActive(true);
    setProgress(0);
    setCurrentSymbol(null);
    setTotalStocks(0);
    setProcessedStocks(0);
    setIsRunning(true);
    
    try {
      // Call our refreshElliottWaveAnalysis function directly
      await refreshElliottWaveAnalysis({
        ignoreCache
      });
    } catch (error) {
      console.error("Error during Elliott Wave analysis:", error);
      setStatusMessage('Failed to complete Elliott Wave analysis');
      setTimeout(() => {
        setOperationActive(false);
        setStatusMessage('');
      }, 3000);
    }
  };

  const handleStart = () => {
    // Get settings for stockCount and cacheExpiryDays
    const stockCount = settings?.stockCount || 100;
    const cacheExpiryDays = settings?.cacheExpiryDays || 7;
    
    // Show initial status
    setStatusMessage('Initializing data refresh...');
    setOperationActive(true);
    setProgress(0);
    setCurrentSymbol(null);
    setTotalStocks(0);
    setProcessedStocks(0);
    
    // Start the full data refresh process
    const worker = startBackgroundRefresh();
    
    if (worker) {
      console.log('Starting full refresh process with settings:', { stockCount, cacheExpiryDays });
      
      // Track worker initialization
      setIsRunning(true);
      
      // Send FULL_DATA_REFRESH message to worker
      worker.postMessage({
        action: 'FULL_DATA_REFRESH',
        payload: {
          options: {
            stockCount,
            cacheExpiryDays
          }
        }
      });
    } else {
      // If worker couldn't be started, show error and reset state
      setStatusMessage('Failed to start background worker');
      setTimeout(() => {
        setOperationActive(false);
        setStatusMessage('');
      }, 3000);
    }
  };

  const handleStop = () => {
    stopBackgroundRefresh();
    setStatusMessage('Operations stopped');
    setOperationActive(false);
    setProgress(0);
    setCurrentSymbol(null);
    setIsRunning(false);
  };

  const getHeartbeatText = () => {
    if (!lastHeartbeat) return 'No heartbeat';
    
    const seconds = Math.round((Date.now() - lastHeartbeat.getTime()) / 1000);
    return seconds <= 60 
      ? `Heartbeat ${seconds}s ago` 
      : `Last heartbeat ${Math.floor(seconds / 60)}m ${seconds % 60}s ago`;
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm font-medium">Background Data Processing</CardTitle>
          <Badge variant={isRunning ? "default" : "secondary"}>
            {isRunning ? "Active" : "Idle"}
          </Badge>
        </div>
        <CardDescription>Manage background data processing tasks</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col space-y-4">
          <div className="flex items-center text-sm">
            <Activity className="h-4 w-4 mr-2" />
            <span>{getHeartbeatText()}</span>
          </div>
          
          {taskCount > 0 && (
            <div className="text-sm">
              Active tasks: {taskCount}
            </div>
          )}
          
          {operationActive && (
            <div className="space-y-2 mt-2">
              <div className="text-sm font-medium">{statusMessage}</div>
              
              {currentSymbol && (
                <div className="text-sm text-muted-foreground">
                  Processing: <span className="font-medium text-primary">{currentSymbol}</span>
                  {totalStocks > 0 && processedStocks > 0 && (
                    <span className="ml-2">({processedStocks}/{totalStocks})</span>
                  )}
                </div>
              )}
              
              <Progress value={progress} className="h-2" />
              <div className="text-xs text-right">{Math.round(progress)}% complete</div>
            </div>
          )}
          
          {/* Manual controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
            {/* Historical data refresh button */}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleStart}
              disabled={isRunning}
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4 mr-2" />
              )}
              Refresh Historical Data
            </Button>
            
            {/* Elliott Wave analysis button */}
            <Button
              variant="outline"
              size="sm"
              onClick={runElliottWaveAnalysis}
              disabled={isRunning}
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4 mr-2" />
              )}
              Analyze Waves
            </Button>
            
            {/* Stop button */}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleStop} 
              disabled={!isRunning}
              className="sm:col-span-2"
            >
              <StopCircle className="h-4 w-4 mr-2" />
              Stop
            </Button>
          </div>
          
          {/* Scheduled refresh section */}
          <div className="border-t pt-4 mt-4">
            <h4 className="font-medium mb-3 flex items-center">
              <ClockIcon className="h-4 w-4 mr-2" />
              Scheduled Elliott Wave Analysis
            </h4>
            
            <div className="space-y-4">
              {/* Enable/disable switch */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Automatic Analysis</Label>
                  <p className="text-xs text-muted-foreground">
                    Periodically refresh Elliott Wave analysis
                  </p>
                </div>
                <Switch
                  checked={scheduledRefreshEnabled}
                  onCheckedChange={handleToggleSchedule}
                  disabled={isRunning}
                />
              </div>
              
              {/* Interval selector */}
              <div className="space-y-2">
                <Label htmlFor="interval">Refresh Interval</Label>
                <Select
                  value={refreshInterval}
                  onValueChange={handleIntervalChange}
                  disabled={!scheduledRefreshEnabled || isRunning}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select interval" />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHEDULE_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Schedule status information */}
              {scheduledRefreshEnabled && (
                <div className="space-y-4">
                  <div className="space-y-1 text-sm">
                    {nextScheduledRun && (
                      <p className="flex items-center">
                        <span className="text-muted-foreground mr-2">Next run:</span>
                        {nextScheduledRun.toLocaleString()}
                      </p>
                    )}
                    {lastScheduledRun && (
                      <p className="flex items-center">
                        <span className="text-muted-foreground mr-2">Last run:</span>
                        {lastScheduledRun.toLocaleString()}
                      </p>
                    )}
                  </div>
                  
                  {/* Cache Control */}
                  <div className="space-y-2">
                    <Label className="text-sm">Cache Control</Label>
                    <RadioGroup
                      defaultValue="respect"
                      value={ignoreCache ? "ignore" : "respect"}
                      onValueChange={(value) => setIgnoreCache(value === "ignore")}
                      className="flex space-x-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="respect" id="respect" />
                        <Label htmlFor="respect" className="text-sm">Respect Cache</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="ignore" id="ignore" />
                        <Label htmlFor="ignore" className="text-sm">Ignore Cache</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  
                  {/* Run Now button */}
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={triggerScheduledRefresh}
                    disabled={isRunning || operationActive}
                    className="w-full"
                  >
                    Run Now
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default BackgroundRefreshControl;