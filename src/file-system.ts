import {computed, makeAutoObservable, observable, runInAction} from "mobx"
import {Selection} from "./selection"

/**
 * FSItem represents all allowed items in a file system. It would be possible
 * to represent File and Directory as a single type, where File simply doesn't
 * have any children. However, splitting them into unique classes allows for
 * richer, type-specific APIs.
 */
export type FSItem = File | Directory

export class File {
    name: string
    type = "file" as const
    parent: Directory | null = null

    constructor(name: string) {
        this.name = name
        makeAutoObservable(this, {
            type: false,
            parent: observable.ref,
        })
    }

    get path() {
        return filepath(this)
    }

    get ext(): string {
        const parts = this.name.split(".")
        if (parts.length === 1) {
            return this.name.startsWith(".") ? parts[0] : ""
        } else {
            return parts.at(-1) || ""
        }
    }
}

export class Directory {
    private _children: FSItem[] = []
    name: string
    type = "directory" as const
    parent: Directory | null = null
    deleted = false

    constructor(name: string) {
        this.name = name
        makeAutoObservable<this, "_children">(this, {
            type: false,
            parent: observable.ref,
            _children: observable.shallow,
        })
    }

    get path() {
        return filepath(this)
    }

    add<T extends FSItem>(item: T): T {
        if (this.deleted) {
            throw new Error("cannot add item to a deleted directory")
        }
        item.parent = this
        this._children.push(item)
        return item
    }

    // TODO: sort items as they are added to the list. I've skipped that for
    // now since this getter returns a cached value until children changes,
    // which yields acceptable performance. A better approach might be one of:
    //
    // a. implement binary search insertion, since items are sorted.
    // b. make users call .sort() when they are done manipulating the list, since
    //    we don't want to continually resort if items are added in bulk.
    // c. queue inserted items and only sort once .children is requested.
    get children() {
        return this._children
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
    }

    delete(item: FSItem) {
        if (item.type === "directory") {
            for (const child of item.children) {
                item.delete(child)
            }
            item.deleted = true
        }
        this._children = this._children.filter((child) => {
            return child !== item
        })
    }
}

/**
 * Returns an FSItem's absolute filepath, e.g. "/foo/bar/baz/qux.txt"
 */
const filepath = (item: FSItem): string => {
    let parts: string[] = []
    do {
        parts.unshift(item.name)
        item = item.parent!
    } while (item)
    return parts.join("/")
}

export class FSViewModel {
    cwd: Directory
    selection: Selection<FSItem>
    expandedDirs: Set<Directory> = new Set()

    constructor(dir: Directory) {
        this.cwd = dir
        this.selection = new Selection(this.cwd.children)
        makeAutoObservable(this, {
            cwd: observable.ref,
            expandedDirs: observable.shallow,
        })
    }

    expanded(item: FSItem): boolean {
        return computed(() => {
            return item.type === "directory" && this.expandedDirs.has(item)
        }).get()
    }

    toggleExpanded(dir: Directory, expanded?: boolean) {
        expanded = expanded ?? !this.expandedDirs.has(dir)
        if (expanded) {
            this.expandedDirs.add(dir)
        } else {
            this.expandedDirs.delete(dir)
        }
    }

    create(type: FSItem["type"], name: string): FSItem {
        name = name.trim()
        if (!name) {
            throw new Error("cannot create an item with an empty name")
        }
        return type === "file" ? new File(name) : new Directory(name)
    }

    selected(item: FSItem) {
        return computed(() => this.selection.has(item)).get()
    }

    deleteSelection() {
        // TODO: would theoretically be more efficient to topologically sort
        // items scheduled for deletion so that we don't bother with child
        // items if their parent is also going to be deleted.
        for (const item of this.selection.items) {
            item.parent?.delete(item)
        }
        this.selection = new Selection(this.cwd.children)
    }

    // TODO: verify performance on large number of elements. May be faster
    // to store cwd.children in sorted order and binary search to see if
    // an item exists with this name.
    isNameAvailable(name: string): boolean {
        return !this.cwd.children.find((item) => item.name === name)
    }
}

export const parents = (item: FSItem): Directory[] => {
    const parents: Directory[] = []
    do {
        item = item.parent!
        if (item) {
            parents.unshift(item)
        }
    } while (item)
    return parents
}

export const seedDirectory = (root: Directory, count: number) => {
    let counter = 1
    const extensions = [
        "txt",
        "ppt",
        "xls",
        "doc",
        "docx",
        "lua",
        "rb",
        "py",
        "js",
        "ts",
        "ts",
        "tsx",
        "jpeg",
        "wav",
        "mp3",
        "mov",
        "mp4",
        "avi",
        "flv",
        "swf",
        "webm",
    ]

    const dir = (name?: string) => {
        if (name) {
            return new Directory(name)
        }
        return new Directory(`directory-${counter++}`)
    }

    const file = (name?: string) => {
        if (name) {
            return new File(name)
        }
        const ext = extensions[Math.floor(Math.random() * extensions.length)]
        return new File(`file-${counter++}.${ext}`)
    }

    runInAction(() => {
        {
            let d = root.add(dir("directory-1"))
            d.add(file())
            d.add(file())
            d.add(file())
        }
        {
            let d = root.add(dir("directory-2"))
            d.add(file())
            d.add(file())
            d.add(file())
            {
                let dd = d.add(dir("directory-1"))
                dd.add(file())
                dd.add(file())
                dd.add(file())
            }
            {
                let dd = d.add(dir("directory-2"))
                dd.add(file())
                dd.add(file())
                dd.add(file())
                {
                    let ddd = dd.add(dir("directory-1"))
                    ddd.add(file())
                    ddd.add(file())
                    ddd.add(file())
                }
            }
        }
        for (let i = 1; i <= count; i++) {
            root.add(file())
        }
    })
}
