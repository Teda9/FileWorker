import { defineStore } from 'pinia'
import { ref } from 'vue'

const useFileStore = defineStore(
    'file',
    () => {
        const visibility = ref("private");
        function setVisibility(newVisibility: string) {
            visibility.value = newVisibility
        }

        return { visibility, setVisibility }
    }
)

export default useFileStore
