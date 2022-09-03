import "./desktop-sim.css"
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useRef,
} from "react"
import {makeAutoObservable, observable, runInAction} from "mobx"
import {observer} from "mobx-react-lite"
import {Button, HStack, VStack} from "./primitives"

const WINDOW_ASPECT_RATIO = 4 / 3
const WINDOW_MIN_WIDTH = 640
const WINDOW_MAX_WIDTH = 1042

export class WindowManager {
    private lastId = 1
    windows: DesktopWindow[] = []

    constructor() {
        makeAutoObservable<this, "lastId">(this, {
            lastId: false,
            windows: observable.shallow,
        })
    }

    createWindow(element: React.ReactElement | null = null): DesktopWindow {
        const w = new DesktopWindow(this, this.lastId++)
        w.element = element
        this.windows.push(w)
        return w
    }
}

class DesktopWindow {
    private manager: WindowManager
    id: number
    title = "New Window"
    element: React.ReactElement | null = null
    details?: string | null = null
    dialog?: {title: string; element: React.ReactElement} | null = null

    constructor(manager: WindowManager, id: number) {
        this.id = id
        this.manager = manager
        makeAutoObservable<this, "manager">(this, {
            id: false,
            manager: false,
            element: observable.ref,
            dialog: observable.ref,
        })
    }

    openDialog(title: string, element: React.ReactElement) {
        this.dialog = {title, element}
    }

    closeDialog() {
        this.dialog = null
    }
}

/**
 * Renders a simulated desktop and its active windows.
 */
export let Desktop = ({windows: wm}: {windows: WindowManager}) => {
    return (
        <div className="desktop">
            <div className="desktop-body">
                {wm.windows.map((win) => {
                    return <WindowObserver key={win.id} window={win} />
                })}
            </div>
        </div>
    )
}
Desktop = observer(Desktop)

/**
 * Renders a simulated desktop window.
 */
const Window = ({
    children,
    title,
    onClose,
    autoSize = true,
    draggable = true,
    canMinimize = true,
    canMaximize = true,
}: {
    children: React.ReactNode
    autoSize?: boolean
    draggable?: boolean
    title?: string
    onClose?(): void
    canMinimize?: boolean
    canMaximize?: boolean
}) => {
    const ref = useRef<HTMLDivElement>(null!)
    const titlebarRef = useRef<HTMLElement>(null!)
    useAutoWindowSize(ref, autoSize)
    useDraggable(ref, titlebarRef, draggable)
    return (
        <div className="window" ref={ref}>
            <header className="window-titlebar" ref={titlebarRef}>
                <span className="window-title">{title}</span>
                <HStack gap={0.25} className="window-buttons">
                    {canMinimize && <Button title="inop">-</Button>}
                    {canMaximize && <Button title="inop">+</Button>}
                    <Button title="Close" onClick={onClose}>
                        x
                    </Button>
                </HStack>
            </header>
            <VStack className="window-body">{children}</VStack>
        </div>
    )
}

const WindowContext = createContext<DesktopWindow | null>(null)
export const useWindowContext = () => useContext(WindowContext)

/**
 * Wrapper around Window that observes changes to window state, whereas Window
 * is just a 'dumb' renderer that's reused in different ways.
 */
let WindowObserver = ({window: win}: {window: DesktopWindow}) => {
    const {element, details, title, dialog} = win
    return (
        <WindowContext.Provider value={win}>
            <Window title={title}>
                <VStack flex={1} className="window-viewport">
                    {element}
                </VStack>
                {details && (
                    <footer className="window-footer">
                        Details: {details}
                    </footer>
                )}
                {dialog && (
                    <Dialog
                        title={dialog.title}
                        onClose={() => win.closeDialog()}
                    >
                        {dialog.element}
                    </Dialog>
                )}
            </Window>
        </WindowContext.Provider>
    )
}
WindowObserver = observer(WindowObserver)

/**
 * Renders a dialog (modal) window, masking the content behind it until closed.
 * The dialog can be closed by clicking outside of its content or by pressing
 * <Escape>.
 */
export const Dialog = ({
    title,
    onClose,
    children,
}: {
    title: string
    children: React.ReactNode
    onClose(): void
}) => {
    const ref = useRef<HTMLDivElement>(null!)
    useEffect(() => {
        const handleKeydown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose()
            }
        }
        document.addEventListener("keydown", handleKeydown)
        return () => {
            document.removeEventListener("keydown", handleKeydown)
        }
    }, [onClose])
    return (
        <div
            ref={ref}
            className="dialog"
            onClick={(e) => {
                // Close the dialog if the user clicks on the background mask.
                if (e.target === ref.current) {
                    onClose()
                }
            }}
        >
            <Window
                title={title}
                autoSize={false}
                draggable={false}
                canMaximize={false}
                canMinimize={false}
                onClose={onClose}
            >
                {children}
            </Window>
        </div>
    )
}

/**
 * Sets the window details string in the host window, if it exists.
 */
export const useWindowTitle = (app: string, title?: string) => {
    const win = useWindowContext()
    useEffect(() => {
        if (!win) return
        runInAction(() => {
            win.title = title ? `${app} - ${title}` : app
        })
    }, [win, title])
}

/**
 * Sets the title in the host window, if it exists.
 */
export const useWindowDetails = (details: string | null) => {
    const win = useWindowContext()
    useEffect(() => {
        if (!win) return
        runInAction(() => {
            win.details = details
        })
    }, [win, details])
}

/**
 * Moves ref.current when draggableRef.current is dragged.
 */
const useDraggable = (
    ref: React.MutableRefObject<HTMLDivElement>,
    draggableRef: React.MutableRefObject<HTMLElement>,
    enabled: boolean,
) => {
    const handleDrag = useCallback(
        (e: MouseEvent) => {
            const elem = ref.current
            const rect = elem.getBoundingClientRect()
            const dx = e.movementX
            const dy = e.movementY
            elem.style.left = rect.x + dx + "px"
            elem.style.top = rect.y + dy + "px"
        },
        [ref],
    )
    useDragListener(draggableRef, handleDrag, enabled)
}

/**
 * Resizes ref.current based on the avaialble space in the browser window,
 * preserving the configured aspect ratio.
 *
 * TODO: resize if necessary when the browser window resizes.
 * TODO: better initial positioning for tiny screens.
 */
const useAutoWindowSize = (
    ref: React.MutableRefObject<HTMLDivElement>,
    enabled: boolean,
) => {
    useLayoutEffect(() => {
        const elem = ref.current
        if (!elem || !enabled) return

        const container = document.body.getBoundingClientRect()
        const width = clamp(
            Math.round(container.width * 0.65),
            WINDOW_MIN_WIDTH,
            WINDOW_MAX_WIDTH,
        )
        const height = width / WINDOW_ASPECT_RATIO
        const top = container.height / 2 - height / 2
        const left = container.width / 2 - width / 2
        elem.style.top = top + "px"
        elem.style.left = left + "px"
        elem.style.width = width + "px"
        elem.style.height = height + "px"
    }, [ref, enabled])
}

/**
 * Reports mouse move events when user drags the target element. Accepts a
 * callback rather than returning a value to reduce re-renders in the calling
 * component. Expects the ref's interior value to be stable.
 */
export const useDragListener = (
    ref: React.MutableRefObject<HTMLElement>,
    onMouseMove: (e: MouseEvent) => void,
    enabled: boolean,
) => {
    useEffect(() => {
        const element = ref.current
        if (!element || !enabled) return

        let shouldReportDrag = false

        const handleMouseDown = (e: MouseEvent) => {
            // Ignore events on interactive elements.
            if ((e.target as HTMLElement).tagName === "BUTTON") {
                return
            }
            shouldReportDrag = true
        }

        const handleMouseUp = () => {
            shouldReportDrag = false
        }

        const handleMouseMove = (e: MouseEvent) => {
            if (shouldReportDrag) {
                onMouseMove(e)
            }
        }

        element.addEventListener("mousedown", handleMouseDown, true)
        document.addEventListener("mouseup", handleMouseUp, true)
        document.addEventListener("mousemove", handleMouseMove, true)
        return () => {
            element.removeEventListener("mousedown", handleMouseDown)
            document.removeEventListener("mouseup", handleMouseUp)
            document.removeEventListener("mousemove", onMouseMove)
        }
    }, [ref, enabled, onMouseMove])
}

/**
 * Returns value bounded by min and max. If smaller than min, returns min.
 * If larger than max, returns max.
 */
const clamp = (value: number, min: number, max: number): number => {
    return Math.min(Math.max(value, min), max)
}
