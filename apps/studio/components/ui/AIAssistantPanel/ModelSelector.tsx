import { Check, ChevronsUpDown } from 'lucide-react'  
import { useState } from 'react'  
  
import { useCheckOpenAIKeyQuery } from 'data/ai/check-api-key-query'  
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'  
import { useRouter } from 'next/router'  
import { Model, PROVIDERS, ProviderName } from 'lib/ai/model.utils'  
import {  
  Badge,  
  Button,  
  CommandGroup_Shadcn_,  
  CommandItem_Shadcn_,  
  CommandList_Shadcn_,  
  Command_Shadcn_,  
  PopoverContent_Shadcn_,  
  PopoverTrigger_Shadcn_,  
  Popover_Shadcn_,  
  TooltipContent,  
  TooltipTrigger,  
  Tooltip,  
} from 'ui'  
  
interface ModelSelectorProps {  
  selectedModel: Model  
  onSelectModel: (model: Model) => void  
}  
  
export const ModelSelector = ({ selectedModel, onSelectModel }: ModelSelectorProps) => {  
  const router = useRouter()  
  const { data: organization } = useSelectedOrganizationQuery()  
  const { data: apiKeyCheck } = useCheckOpenAIKeyQuery()  
  
  const [open, setOpen] = useState(false)  
  
  const canAccessProModels = organization?.plan?.id !== 'free'  
  const slug = organization?.slug ?? '_'  
  const upgradeHref = `/org/${slug}/billing?panel=subscriptionPlan&source=ai-assistant-model`  
  
  // Get the active provider from the API check  
  const activeProvider = apiKeyCheck?.activeProvider  
  
  // Define which models require pro access  
  const proModels: Model[] = ['gpt-5', 'anthropic.claude-3-7-sonnet-20250219-v1:0', 'claude-sonnet-4-20250514']  
  
  const handleSelectModel = (model: Model) => {  
    if (proModels.includes(model) && !canAccessProModels) {  
      setOpen(false)  
      void router.push(upgradeHref)  
      return  
    }  
  
    onSelectModel(model)  
    setOpen(false)  
  }  
  
  // Only show models from the active provider  
  const availableModels = activeProvider && PROVIDERS[activeProvider]  
    ? Object.keys(PROVIDERS[activeProvider].models)  
    : []  
  
  return (  
    <Popover_Shadcn_ open={open} onOpenChange={setOpen}>  
      <PopoverTrigger_Shadcn_ asChild>  
        <Button  
          type="outline"  
          className="text-foreground-light"  
          iconRight={<ChevronsUpDown strokeWidth={1} size={12} />}  
        >  
          {selectedModel}  
        </Button>  
      </PopoverTrigger_Shadcn_>  
      <PopoverContent_Shadcn_ className="p-0 w-64" align="start" side="top">  
        <Command_Shadcn_>  
          <CommandList_Shadcn_>  
            {activeProvider && (  
              <CommandGroup_Shadcn_ heading={activeProvider.toUpperCase()}>  
                {availableModels.map((modelId) => {  
                  const model = modelId as Model  
                  const requiresUpgrade = proModels.includes(model) && !canAccessProModels  
                    
                  return (  
                    <CommandItem_Shadcn_  
                      key={model}  
                      value={model}  
                      onSelect={() => handleSelectModel(model)}  
                      className="flex justify-between"  
                    >  
                      <span className="truncate">{model}</span>  
                      {requiresUpgrade ? (  
                        <Tooltip>  
                          <TooltipTrigger asChild>  
                            <div>  
                              <Badge role="button" variant="warning">  
                                Upgrade  
                              </Badge>  
                            </div>  
                          </TooltipTrigger>  
                          <TooltipContent side="right">  
                            {model} is available on Pro plans and above  
                          </TooltipContent>  
                        </Tooltip>  
                      ) : selectedModel === model ? (  
                        <Check className="h-3.5 w-3.5" />  
                      ) : null}  
                    </CommandItem_Shadcn_>  
                  )  
                })}  
              </CommandGroup_Shadcn_>  
            )}  
          </CommandList_Shadcn_>  
        </Command_Shadcn_>  
      </PopoverContent_Shadcn_>  
    </Popover_Shadcn_>  
  )  
}
