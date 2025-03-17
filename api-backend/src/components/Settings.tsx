import React, { useState } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { useKillSwitch } from '@/context/KillSwitchContext';

const Settings: React.FC = () => {
  const { killSwitch } = useKillSwitch();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="h-9 w-9 rounded-full">
          <SettingsIcon className="h-4 w-4" />
          <span className="sr-only">Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure application settings and access administration features.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Administration</h4>
            <p className="text-sm text-muted-foreground">
              Visit the admin dashboard for advanced options including cache management, 
              analysis controls, and system status.
            </p>
            <div className="flex flex-col gap-2 mt-2">
              <Button asChild>
                <Link to="/admin" onClick={() => setOpen(false)}>
                  Admin Dashboard
                </Link>
              </Button>
            </div>
          </div>

          {killSwitch && (
            <div className="space-y-2 pt-4 border-t">
              <h4 className="font-medium text-sm text-destructive">Kill Switch Active</h4>
              <p className="text-sm text-muted-foreground">
                Extended analysis features are currently disabled to reduce server load.
                Visit the admin dashboard to manage this setting.
              </p>
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default Settings;