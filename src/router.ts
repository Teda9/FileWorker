import { createRouter, createWebHashHistory } from "vue-router";
import i18n from "./i18n";

import IndexPage from "./pages/IndexPage.vue";

const ClipPage = () => import("./pages/ClipPage.vue");
const FilePage = () => import("./pages/FilePage.vue");
const LoginPage = () => import("./pages/LoginPage.vue");
const FileManagePage = () => import("./pages/FileManagePage.vue");

const $t = i18n.global.t;

const routes = [
    {
        path: "/",
        name: "index",
        meta: {
            title: $t("page_title.index"),
        },
        component: IndexPage,
    },
    {
        path: "/clip",
        name: "clip",
        meta: {
            title: $t("page_title.clip"),
        },
        component: ClipPage,
    },
    {
        path: "/file",
        name: "file",
        meta: {
            title: $t("page_title.file"),
        },
        component: FilePage,
    },
    {
        path: "/filemanage",
        name: "filemanage",
        meta: {
            title: $t("page_title.filemanage"),
        },
        component: FileManagePage,
        props: { kind: "file" },
    },
    {
        path: "/clipmanage",
        name: "clipmanage",
        meta: {
            title: $t("page_title.clipmanage"),
        },
        component: FileManagePage,
        props: { kind: "text" },
    },
    {
        path: "/login",
        name: "login",
        meta: {
            title: $t("page_title.login"),
        },
        component: LoginPage,
    },
];

const router = createRouter({
    history: createWebHashHistory(),
    routes,
});

router.beforeEach(async (to) => {
    if (to.meta.title) {
        document.title = to.meta.title as string;
    }
    if (to.path === '/login') return true;
    try {
        const response = await fetch('/api/auth', { cache: 'no-store' });
        if (response.ok) return true;
    } catch {
        // The login page can show a connection error when authentication is retried.
    }
    return { path: '/login', query: { redirect: to.fullPath } };
})

export default router;
export { routes };
