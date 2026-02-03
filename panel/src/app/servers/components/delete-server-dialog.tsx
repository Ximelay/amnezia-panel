'use client';

import { Button } from '@/components/ui/button';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/trpc/react';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
    id: number;
}

export default function DeleteServerDialog({ id }: Readonly<Props>) {
    const [isDelete, setIsDelete] = useState(false);

    const utils = api.useUtils();

    const deleteServer = api.servers.deleteServer.useMutation({
        onSuccess: () => {
            utils.servers.getServers.invalidate();
            utils.servers.getServersTable.invalidate();
            toast.success('Server was successfully deleted');
        },
        onError: (error) => {
            toast.error('Error');
            console.error(error);
        },
    });

    const handleDeleteServer = () => {
        deleteServer.mutate({ id });
    };

    return (
        <>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="cursor-pointer text-red-400 hover:text-red-600"
                        onClick={() => setIsDelete(true)}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>Delete server</p>
                </TooltipContent>
            </Tooltip>

            <AlertDialog open={isDelete} onOpenChange={setIsDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be canceled. This will permanently delete the server
                            and all related objects will also be deleted.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteServer}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
